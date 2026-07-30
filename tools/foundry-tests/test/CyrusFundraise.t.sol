// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CyrusFundraise} from "../../../contracts/evm/CyrusFundraise.sol";
import {TestToken} from "../../../contracts/evm/TestToken.sol";

/**
 * Unit tests for CyrusFundraise (v2 — adds opt-in `listed` + on-chain title
 * for the /discover directory).
 *
 * Invariants under test:
 *   - createCampaign mints sequential ids, stores money-truth + title +
 *     listed flag, computes the $0.10 minFee from decimals, emits.
 *   - donate/donateNative split fee = max($0.10, 0.1%) and FORWARD both legs
 *     in-tx (contract balance always 0 — non-custodial).
 *   - setListed is recipient-only; getListedCampaigns returns only listed ones.
 *   - Revert paths: zero recipient/fee-collector, native/erc20 mismatch, zero
 *     amount, below-min donation, inactive campaign, wrong closer/lister.
 */
contract CyrusFundraiseTest is Test {
    CyrusFundraise fr;
    TestToken token;

    address constant OWNER = address(0xF00D);
    address constant DONOR = address(0xD0A);
    address constant STRANGER = address(0xBAD);
    address constant FEE_COLLECTOR = address(0xFEE);

    event CampaignCreated(uint256 indexed id, address indexed recipient, address indexed token, uint256 goal, string title, string metaURI, bool listed);
    event CampaignListed(uint256 indexed id, bool listed);
    event Donation(uint256 indexed id, address indexed donor, uint256 amount, uint256 fee, uint256 newRaised);
    event CampaignClosed(uint256 indexed id);

    uint256 constant TTK_MIN_FEE = 0.1 ether; // 18-dec → $0.10 floor = 10^17

    function _fee(uint256 amount) internal pure returns (uint256) { return (amount * 10) / 10_000; }
    function _feeErc20(uint256 amount) internal pure returns (uint256) {
        uint256 pct = (amount * 10) / 10_000;
        return pct > TTK_MIN_FEE ? pct : TTK_MIN_FEE;
    }

    /// Helper: create an unlisted TTK campaign owned by OWNER, return id.
    function _create(uint256 goal) internal returns (uint256 id) {
        vm.prank(OWNER);
        id = fr.createCampaign(OWNER, address(token), goal, "x", "", false);
    }

    function setUp() public {
        fr = new CyrusFundraise(FEE_COLLECTOR);
        token = new TestToken();
        token.transfer(DONOR, 1_000 ether);
    }

    // ---- constructor ------------------------------------------------
    function test_constructor_revertsOnZeroFeeCollector() public {
        vm.expectRevert(CyrusFundraise.ZeroFeeCollector.selector);
        new CyrusFundraise(address(0));
    }
    function test_feeCollector_isSet() public view {
        assertEq(fr.feeCollector(), FEE_COLLECTOR);
        assertEq(fr.FEE_BPS(), 10);
    }

    // ---- create -----------------------------------------------------
    function test_createCampaign_storesTitleListedMinFee_andEmits() public {
        vm.expectEmit(true, true, true, true);
        emit CampaignCreated(1, OWNER, address(token), 1_000 ether, "Baby fund", "ipfs://x", true);

        vm.prank(OWNER);
        uint256 id = fr.createCampaign(OWNER, address(token), 1_000 ether, "Baby fund", "ipfs://x", true);
        assertEq(id, 1);
        assertEq(fr.nextId(), 2);

        CyrusFundraise.Campaign memory c = fr.getCampaign(1);
        assertEq(c.recipient, OWNER);
        assertEq(c.token, address(token));
        assertEq(c.goal, 1_000 ether);
        assertEq(c.raised, 0);
        assertEq(c.minFee, TTK_MIN_FEE);
        assertTrue(c.active);
        assertTrue(c.listed);
        assertEq(c.title, "Baby fund");

        // native → minFee 0, and default unlisted
        vm.prank(OWNER);
        uint256 id2 = fr.createCampaign(OWNER, fr.NATIVE(), 0, "Native", "", false);
        assertEq(id2, 2);
        assertEq(fr.getCampaign(2).minFee, 0);
        assertFalse(fr.getCampaign(2).listed);
    }

    function test_createCampaign_revertsOnZeroRecipient() public {
        vm.expectRevert(CyrusFundraise.ZeroRecipient.selector);
        fr.createCampaign(address(0), address(token), 0, "x", "", false);
    }

    // ---- listing / directory ---------------------------------------
    function test_setListed_onlyRecipient() public {
        uint256 id = _create(0);
        assertFalse(fr.getCampaign(id).listed);

        vm.prank(STRANGER);
        vm.expectRevert(CyrusFundraise.NotRecipient.selector);
        fr.setListed(id, true);

        vm.prank(OWNER);
        vm.expectEmit(true, false, false, true);
        emit CampaignListed(id, true);
        fr.setListed(id, true);
        assertTrue(fr.getCampaign(id).listed);
    }

    function test_getListedCampaigns_returnsOnlyListed() public {
        // 3 campaigns; list #1 and #3.
        vm.startPrank(OWNER);
        fr.createCampaign(OWNER, address(token), 0, "one", "", true);
        fr.createCampaign(OWNER, address(token), 0, "two", "", false);
        fr.createCampaign(OWNER, address(token), 0, "three", "", true);
        vm.stopPrank();

        (uint256[] memory ids, CyrusFundraise.Campaign[] memory list) = fr.getListedCampaigns(1, 100);
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 3);
        assertEq(list[0].title, "one");
        assertEq(list[1].title, "three");
    }

    // ---- donate (ERC-20) -------------------------------------------
    function test_donate_splitsFee_bothBranches_bumpsRaised_nonCustodial() public {
        uint256 id = _create(1_000 ether);

        uint256 amount1 = 200 ether;               // above $100 → 0.1% branch
        uint256 fee1 = _feeErc20(amount1);
        assertEq(fee1, 0.2 ether);
        vm.startPrank(DONOR);
        token.approve(address(fr), amount1);
        vm.expectEmit(true, true, false, true);
        emit Donation(id, DONOR, amount1, fee1, amount1);
        fr.donate(id, amount1);
        vm.stopPrank();
        assertEq(token.balanceOf(OWNER), amount1 - fee1);
        assertEq(token.balanceOf(FEE_COLLECTOR), fee1);
        assertEq(fr.raisedOf(id), amount1);
        assertEq(token.balanceOf(address(fr)), 0);

        uint256 amount2 = 10 ether;                // below $100 → $0.10 floor
        uint256 fee2 = _feeErc20(amount2);
        assertEq(fee2, 0.1 ether);
        vm.startPrank(DONOR);
        token.approve(address(fr), amount2);
        fr.donate(id, amount2);
        vm.stopPrank();
        assertEq(fr.raisedOf(id), amount1 + amount2);
        assertEq(token.balanceOf(OWNER), (amount1 - fee1) + (amount2 - fee2));
        assertEq(token.balanceOf(FEE_COLLECTOR), fee1 + fee2);
        assertEq(token.balanceOf(address(fr)), 0);
    }

    function test_donate_revertsBelowMinDonation() public {
        uint256 id = _create(0);
        vm.startPrank(DONOR);
        token.approve(address(fr), 0.05 ether);
        vm.expectRevert(CyrusFundraise.BelowMinDonation.selector);
        fr.donate(id, 0.05 ether);
        vm.stopPrank();
    }

    function test_donate_revertsOnZeroAmount() public {
        uint256 id = _create(0);
        vm.prank(DONOR);
        vm.expectRevert(CyrusFundraise.ZeroAmount.selector);
        fr.donate(id, 0);
    }

    function test_donate_revertsOnNativeCampaign() public {
        vm.prank(OWNER);
        uint256 id = fr.createCampaign(OWNER, fr.NATIVE(), 0, "native", "", false);
        vm.prank(DONOR);
        vm.expectRevert(CyrusFundraise.NativeMismatch.selector);
        fr.donate(id, 1 ether);
    }

    // ---- donateNative ----------------------------------------------
    function test_donateNative_splitsFee_forwardsEth_bumpsRaised_nonCustodial() public {
        vm.prank(OWNER);
        uint256 id = fr.createCampaign(OWNER, fr.NATIVE(), 5 ether, "native", "", false);

        vm.deal(DONOR, 3 ether);
        uint256 ownerBefore = OWNER.balance;
        uint256 feeCollBefore = FEE_COLLECTOR.balance;
        uint256 amount = 2 ether;
        uint256 fee = _fee(amount); // native floor 0 → straight 0.1%

        vm.prank(DONOR);
        vm.expectEmit(true, true, false, true);
        emit Donation(id, DONOR, amount, fee, amount);
        fr.donateNative{value: amount}(id);

        assertEq(OWNER.balance, ownerBefore + (amount - fee));
        assertEq(FEE_COLLECTOR.balance, feeCollBefore + fee);
        assertEq(fr.raisedOf(id), amount);
        assertEq(address(fr).balance, 0);
    }

    function test_donateNative_revertsOnErc20Campaign() public {
        uint256 id = _create(0);
        vm.deal(DONOR, 1 ether);
        vm.prank(DONOR);
        vm.expectRevert(CyrusFundraise.NativeMismatch.selector);
        fr.donateNative{value: 1 ether}(id);
    }

    function test_donateNative_revertsOnZeroValue() public {
        vm.prank(OWNER);
        uint256 id = fr.createCampaign(OWNER, fr.NATIVE(), 0, "native", "", false);
        vm.prank(DONOR);
        vm.expectRevert(CyrusFundraise.ZeroAmount.selector);
        fr.donateNative{value: 0}(id);
    }

    // ---- close ------------------------------------------------------
    function test_close_onlyRecipient_thenDonationsRevert() public {
        uint256 id = _create(0);

        vm.prank(STRANGER);
        vm.expectRevert(CyrusFundraise.NotRecipient.selector);
        fr.closeCampaign(id);

        vm.prank(OWNER);
        vm.expectEmit(true, false, false, false);
        emit CampaignClosed(id);
        fr.closeCampaign(id);

        vm.startPrank(DONOR);
        token.approve(address(fr), 1 ether);
        vm.expectRevert(CyrusFundraise.CampaignInactive.selector);
        fr.donate(id, 1 ether);
        vm.stopPrank();
    }
}
