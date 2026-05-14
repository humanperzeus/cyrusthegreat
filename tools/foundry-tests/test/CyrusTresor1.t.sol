// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {CyrusTresor1} from "../../../contracts/evm/CyrusTresor1.sol";
import {TestToken} from "../../../contracts/evm/TestToken.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";

/**
 * Unit tests for CyrusTresor1's anonymity pool layer.
 *
 * Covers:
 *   - Constructor input validation (zero addresses, length mismatches, zero buckets)
 *   - commitToPool happy paths (ETH + ERC-20)
 *   - commitToPool reverts (bad bucket, wrong msg.value, commitment reuse)
 *   - revealFromPool happy path (after epoch boundary, via vm.warp)
 *   - revealFromPool reverts (unknown commitment, MEV-redirect, double-spend,
 *     same-epoch, zero withdrawTo)
 *   - Regular vault Bank8 surface: spot-check that depositETH still works
 *     (full Bank8 coverage lives in the debug UI's b8-* tests on-chain)
 *
 * Notes on epoch testing:
 *   - The contract uses `block.timestamp / 3600` for epoch. Foundry's
 *     vm.warp() lets us skip directly to the next hour boundary.
 */
contract CyrusTresor1Test is Test {
    CyrusTresor1 vault;
    TestToken token;
    MockV3Aggregator priceFeed;

    // Test actors
    address constant FEE_COLLECTOR = address(0xFEEC0);
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant CAROL = address(0xCA801);

    // Pool config
    bytes32 constant CONTRACT_SALT = bytes32(uint256(0xCAFE));
    uint256[] ethBuckets;
    uint256[] tokenBuckets;

    // ECONOMIC fee scale — Chainlink mock returns $2000/ETH at 8 decimals,
    // contract charges $0.10 USD ≈ 0.00005 ETH at this price.
    int256 constant PRICE_ANSWER = 2000_00000000;  // $2000.00 with 8 decimals

    // Reusable bytes32 entropy for tests
    bytes32 constant SECRET_A = bytes32(uint256(0xA1));
    bytes32 constant SALT_A   = bytes32(uint256(0xA2));

    // --------------------------------------------------------------------
    //  Setup
    // --------------------------------------------------------------------
    function setUp() public {
        // Move forward so block.timestamp > 0 epoch
        vm.warp(100_000 hours);

        priceFeed = new MockV3Aggregator(8, PRICE_ANSWER);
        token = new TestToken();

        // ETH buckets: 0.001 / 0.01 / 0.1 / 1
        ethBuckets.push(0.001 ether);
        ethBuckets.push(0.01 ether);
        ethBuckets.push(0.1 ether);
        ethBuckets.push(1 ether);

        // ERC-20 buckets: 10 / 100 / 1000 / 10000 (18 decimals)
        tokenBuckets.push(10 ether);
        tokenBuckets.push(100 ether);
        tokenBuckets.push(1000 ether);
        tokenBuckets.push(10000 ether);

        address[] memory poolTokens = new address[](2);
        poolTokens[0] = address(0); // native ETH
        poolTokens[1] = address(token);

        uint256[][] memory schedules = new uint256[][](2);
        schedules[0] = ethBuckets;
        schedules[1] = tokenBuckets;

        vault = new CyrusTresor1(
            FEE_COLLECTOR,
            CONTRACT_SALT,
            address(priceFeed),
            poolTokens,
            schedules,
            address(0) // zkVerifier = v1
        );

        // Fund test accounts
        vm.deal(ALICE, 100 ether);
        vm.deal(BOB, 100 ether);
        vm.deal(CAROL, 100 ether);
        token.transfer(ALICE, 100_000 ether);
        token.transfer(BOB,   100_000 ether);
    }

    // --------------------------------------------------------------------
    //  Helpers
    // --------------------------------------------------------------------
    function _commitmentHash(
        bytes32 secret,
        bytes32 userSalt,
        address withdrawTo,
        address tokenAddr,
        uint8 bucketIdx
    ) internal view returns (bytes32) {
        return keccak256(abi.encode(
            secret, userSalt, withdrawTo, tokenAddr, bucketIdx,
            address(vault), block.chainid
        ));
    }

    function _currentFee() internal view returns (uint256) {
        return vault.getCurrentFeeInWei();
    }

    function _warpToNextEpoch() internal {
        uint256 currentEpoch = block.timestamp / 3600;
        uint256 nextEpochStart = (currentEpoch + 1) * 3600;
        vm.warp(nextEpochStart);
    }

    // --------------------------------------------------------------------
    //  Constructor validation
    // --------------------------------------------------------------------
    function test_constructor_revertsOnZeroFeeCollector() public {
        address[] memory pt = new address[](0);
        uint256[][] memory sc = new uint256[][](0);
        vm.expectRevert("Invalid fee collector");
        new CyrusTresor1(address(0), CONTRACT_SALT, address(priceFeed), pt, sc, address(0));
    }

    function test_constructor_revertsOnZeroPriceFeed() public {
        address[] memory pt = new address[](0);
        uint256[][] memory sc = new uint256[][](0);
        vm.expectRevert("Invalid price feed");
        new CyrusTresor1(FEE_COLLECTOR, CONTRACT_SALT, address(0), pt, sc, address(0));
    }

    function test_constructor_revertsOnLengthMismatch() public {
        address[] memory pt = new address[](2);
        pt[0] = address(0); pt[1] = address(token);
        uint256[][] memory sc = new uint256[][](1);  // only 1 schedule for 2 tokens
        sc[0] = ethBuckets;
        vm.expectRevert("pool: tokens/buckets length mismatch");
        new CyrusTresor1(FEE_COLLECTOR, CONTRACT_SALT, address(priceFeed), pt, sc, address(0));
    }

    function test_constructor_revertsOnEmptyBucketSchedule() public {
        address[] memory pt = new address[](1);
        pt[0] = address(0);
        uint256[][] memory sc = new uint256[][](1);
        sc[0] = new uint256[](0);  // empty schedule
        vm.expectRevert("pool: empty bucket schedule");
        new CyrusTresor1(FEE_COLLECTOR, CONTRACT_SALT, address(priceFeed), pt, sc, address(0));
    }

    function test_constructor_revertsOnZeroBucketSize() public {
        address[] memory pt = new address[](1);
        pt[0] = address(0);
        uint256[][] memory sc = new uint256[][](1);
        uint256[] memory badBuckets = new uint256[](2);
        badBuckets[0] = 0.001 ether;
        badBuckets[1] = 0;  // zero — should revert
        sc[0] = badBuckets;
        vm.expectRevert("pool: zero bucket size");
        new CyrusTresor1(FEE_COLLECTOR, CONTRACT_SALT, address(priceFeed), pt, sc, address(0));
    }

    // --------------------------------------------------------------------
    //  View / read tests
    // --------------------------------------------------------------------
    function test_currentEpoch_matchesBlockTimestamp() public view {
        assertEq(vault.currentEpoch(), block.timestamp / 3600);
    }

    function test_EPOCH_LENGTH_is3600() public view {
        assertEq(vault.EPOCH_LENGTH(), 3600);
    }

    function test_getPoolBucketSize_ethBucket0() public view {
        assertEq(vault.getPoolBucketSize(address(0), 0), 0.001 ether);
    }

    function test_getPoolBucketSize_revertsOnOutOfRange() public {
        vm.expectRevert("pool: bucket index out of range");
        vault.getPoolBucketSize(address(0), 99);
    }

    function test_getPoolBucketSize_unknownTokenReverts() public {
        // mapping returns empty array for unknown tokens → length check trips
        vm.expectRevert("pool: bucket index out of range");
        vault.getPoolBucketSize(address(0xDEAD), 0);
    }

    function test_zkVerifierIsZeroInV1() public view {
        assertEq(vault.zkVerifier(), address(0));
    }

    // --------------------------------------------------------------------
    //  commitToPool — ETH happy paths
    // --------------------------------------------------------------------
    function test_commitToPool_ETH_happyPath() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, ALICE, address(0), 0);
        uint256 fee = _currentFee();
        uint256 bucketSize = 0.001 ether;

        vm.prank(ALICE);
        vault.commitToPool{value: bucketSize + fee}(commitment, address(0), 0);

        // Verify state: commitment exists, depositEpoch set, not yet spent
        (uint64 depositEpoch, bool spent) = vault.commitments(commitment);
        assertEq(depositEpoch, block.timestamp / 3600);
        assertEq(spent, false);

        // Vault holds the bucket + fee
        assertEq(address(vault).balance, bucketSize + fee);
    }

    function test_commitToPool_emitsEventWithoutSender() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, ALICE, address(0), 0);
        uint256 fee = _currentFee();

        // Topic 0 = keccak("PoolDeposit(bytes32,address,uint8,uint256)") — but
        // we don't check exact topics; we verify the event was emitted at all
        // AND that msg.sender is NOT in the event signature.
        // (We rely on the contract not emitting any other event in this path.)
        vm.recordLogs();
        vm.prank(ALICE);
        vault.commitToPool{value: 0.001 ether + fee}(commitment, address(0), 0);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        // 1 log for PoolDeposit. No msg.sender anywhere in the topic list.
        assertEq(logs.length, 1);
        // PoolDeposit topics: [signature, commitment, token]
        // (NOT including msg.sender, ALICE)
        for (uint i = 0; i < logs[0].topics.length; i++) {
            assertTrue(
                logs[0].topics[i] != bytes32(uint256(uint160(ALICE))),
                "msg.sender leaked into event topic"
            );
        }
    }

    // --------------------------------------------------------------------
    //  commitToPool — reverts
    // --------------------------------------------------------------------
    function test_commitToPool_revertsOnReuse() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, ALICE, address(0), 0);
        uint256 fee = _currentFee();

        vm.prank(ALICE);
        vault.commitToPool{value: 0.001 ether + fee}(commitment, address(0), 0);

        // Second commit with the same commitment hash should revert.
        vm.prank(BOB);
        vm.expectRevert("pool: commitment already used");
        vault.commitToPool{value: 0.001 ether + fee}(commitment, address(0), 0);
    }

    function test_commitToPool_revertsOnBadBucketIdx() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, ALICE, address(0), 99);
        uint256 fee = _currentFee();

        vm.prank(ALICE);
        vm.expectRevert("pool: bucket index out of range");
        vault.commitToPool{value: 0.001 ether + fee}(commitment, address(0), 99);
    }

    function test_commitToPool_ETH_revertsOnWrongMsgValue() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, ALICE, address(0), 0);
        uint256 fee = _currentFee();
        uint256 bucketSize = 0.001 ether;

        // Too much
        vm.prank(ALICE);
        vm.expectRevert("pool: native msg.value must equal bucketSize + fee");
        vault.commitToPool{value: bucketSize + fee + 1}(commitment, address(0), 0);

        // Too little
        vm.prank(ALICE);
        vm.expectRevert("pool: native msg.value must equal bucketSize + fee");
        vault.commitToPool{value: bucketSize + fee - 1}(commitment, address(0), 0);
    }

    function test_commitToPool_ERC20_happyPath() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, ALICE, address(token), 0);
        uint256 fee = _currentFee();
        uint256 bucketSize = 10 ether;

        vm.prank(ALICE);
        token.approve(address(vault), bucketSize);

        vm.prank(ALICE);
        vault.commitToPool{value: fee}(commitment, address(token), 0);

        assertEq(token.balanceOf(address(vault)), bucketSize);
    }

    function test_commitToPool_ERC20_revertsOnWrongMsgValue() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, ALICE, address(token), 0);
        uint256 fee = _currentFee();

        vm.prank(ALICE);
        token.approve(address(vault), 10 ether);

        // msg.value should equal fee only (bucket is via transferFrom)
        vm.prank(ALICE);
        vm.expectRevert("pool: erc20 msg.value must equal fee");
        vault.commitToPool{value: fee + 1}(commitment, address(token), 0);
    }

    // --------------------------------------------------------------------
    //  revealFromPool — happy path
    // --------------------------------------------------------------------
    function test_revealFromPool_happyPath_afterEpoch() public {
        // Commit
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, BOB, address(0), 0);
        uint256 fee = _currentFee();
        vm.prank(ALICE);
        vault.commitToPool{value: 0.001 ether + fee}(commitment, address(0), 0);

        // Warp past the epoch boundary
        _warpToNextEpoch();

        // Reveal — anyone with the secret can call; CAROL submits on BOB's behalf
        uint256 bobBalBefore = BOB.balance;
        vm.prank(CAROL);
        vault.revealFromPool(SECRET_A, SALT_A, BOB, address(0), 0, "");

        // BOB received the bucket
        assertEq(BOB.balance, bobBalBefore + 0.001 ether);

        // Commitment is marked spent
        (, bool spent) = vault.commitments(commitment);
        assertEq(spent, true);
    }

    function test_revealFromPool_happyPath_ERC20() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, BOB, address(token), 0);
        uint256 fee = _currentFee();

        vm.prank(ALICE);
        token.approve(address(vault), 10 ether);
        vm.prank(ALICE);
        vault.commitToPool{value: fee}(commitment, address(token), 0);

        _warpToNextEpoch();

        uint256 bobBalBefore = token.balanceOf(BOB);
        vm.prank(CAROL);
        vault.revealFromPool(SECRET_A, SALT_A, BOB, address(token), 0, "");

        assertEq(token.balanceOf(BOB), bobBalBefore + 10 ether);
    }

    // --------------------------------------------------------------------
    //  revealFromPool — reverts (spec § 6 + § 9)
    // --------------------------------------------------------------------
    function test_revealFromPool_revertsOnSameEpoch() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, BOB, address(0), 0);
        uint256 fee = _currentFee();
        vm.prank(ALICE);
        vault.commitToPool{value: 0.001 ether + fee}(commitment, address(0), 0);

        // No warp — same epoch
        vm.prank(BOB);
        vm.expectRevert("pool: must wait at least 1 epoch after commit");
        vault.revealFromPool(SECRET_A, SALT_A, BOB, address(0), 0, "");
    }

    function test_revealFromPool_revertsOnUnknownCommitment() public {
        // Nothing committed; reveal with a fresh secret
        _warpToNextEpoch(); // not strictly needed but mirrors normal flow

        vm.prank(BOB);
        vm.expectRevert("pool: unknown commitment");
        vault.revealFromPool(SECRET_A, SALT_A, BOB, address(0), 0, "");
    }

    function test_revealFromPool_revertsOnMEVRedirect() public {
        // Commit with BOB as withdrawTo
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, BOB, address(0), 0);
        uint256 fee = _currentFee();
        vm.prank(ALICE);
        vault.commitToPool{value: 0.001 ether + fee}(commitment, address(0), 0);
        _warpToNextEpoch();

        // Try to redirect to CAROL — different keccak preimage → unknown commitment
        vm.prank(CAROL);
        vm.expectRevert("pool: unknown commitment");
        vault.revealFromPool(SECRET_A, SALT_A, CAROL, address(0), 0, "");
    }

    function test_revealFromPool_revertsOnDoubleSpend() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, BOB, address(0), 0);
        uint256 fee = _currentFee();
        vm.prank(ALICE);
        vault.commitToPool{value: 0.001 ether + fee}(commitment, address(0), 0);
        _warpToNextEpoch();

        // First reveal — succeeds
        vm.prank(CAROL);
        vault.revealFromPool(SECRET_A, SALT_A, BOB, address(0), 0, "");

        // Second reveal — same params, should be blocked by `spent` flag
        vm.prank(CAROL);
        vm.expectRevert("pool: commitment already spent");
        vault.revealFromPool(SECRET_A, SALT_A, BOB, address(0), 0, "");
    }

    function test_revealFromPool_revertsOnZeroWithdrawTo() public {
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, address(0), address(0), 0);
        // Don't even need to commit — we expect early revert
        vm.prank(BOB);
        vm.expectRevert("pool: withdrawTo is zero address");
        vault.revealFromPool(SECRET_A, SALT_A, address(0), address(0), 0, "");
    }

    function test_revealFromPool_revertsOnWrongBucketIdx() public {
        // Commit at bucketIdx 0, try to reveal at bucketIdx 1 — different keccak.
        bytes32 commitment = _commitmentHash(SECRET_A, SALT_A, BOB, address(0), 0);
        uint256 fee = _currentFee();
        vm.prank(ALICE);
        vault.commitToPool{value: 0.001 ether + fee}(commitment, address(0), 0);
        _warpToNextEpoch();

        vm.prank(BOB);
        vm.expectRevert("pool: unknown commitment");
        vault.revealFromPool(SECRET_A, SALT_A, BOB, address(0), 1, "");
    }

    // --------------------------------------------------------------------
    //  Regular vault (Bank8 surface) spot check
    // --------------------------------------------------------------------
    function test_bank8Surface_depositETHStillWorks() public {
        // Confirms the regular-vault path wasn't broken by pool additions.
        uint256 fee = _currentFee();
        uint256 amount = 0.005 ether;

        vm.prank(ALICE);
        vault.depositETH{value: amount + fee}();

        // Bank8 doesn't expose a public getBalance for the obfuscated vault
        // by user; but the internal accounting is unchanged from Bank8 (which
        // is already covered by 12/12 on-chain tests via the debug UI).
        // We just confirm the call didn't revert and the vault accepted the value.
        assertEq(address(vault).balance, amount + fee);
    }

}
