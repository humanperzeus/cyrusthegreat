# CyrusTresor1 — paper spec

**Status:** IMPLEMENTATION-READY (2026-05-13). All design decisions resolved. Next session may begin writing `contracts/evm/CyrusTresor1.sol` against this spec.
**Started:** 2026-05-13
**Last updated:** 2026-05-13
**Lineage:** Bank8 base + anonymity-pool layer + teleport semantics.
**Contract filename:** `contracts/evm/CyrusTresor1.sol`.

This spec captures decisions made during design discussions, in order. Open questions are flagged with **`OPEN:`**. When a question is resolved, replace it with a decision + one-line justification.

---

## 1. Goals & non-goals

### Goals
- All Bank8 functionality preserved as a "regular vault" mode (per-address obfuscated balances, deposit/withdraw/transfer, dynamic ~$0.10 fee).
- New "anonymity pool" mode users can opt into. Within the pool: deposits and withdrawals are batched into fixed time windows + standardized to fixed denomination buckets, so a chain-analyst-grade adversary cannot link a specific deposit to a specific withdrawal by amount or timing.
- **Teleport UX**: a depositor can produce a one-time claim secret out-of-band (off-chain), shared with a recipient via the dapp UI (claim URI / QR / message). Recipient claims from any address.
- Storage scoped per-user (no global mutable state that one user can wipe for everyone — Portal11 lesson #3).
- Architecture extensible to ZK proofs (Tornado-style) in a v2 without rewriting the contract: leave verifier-address and proof-bytes parameters reserved.
- Same multi-chain model as Bank8: independent deployment per chain, no bridge.

### Non-goals (this version)
- ZK proofs (deferred to v2). Without ZK, deposit→withdraw is still recoverable by determined manual chain analysis; we are NOT claiming defeat of state-level adversaries.
- Cross-chain teleport (no bridge).
- Configurable epoch length per user (one global setting per contract instance).
- Governance / upgradability (immutable contract, redeploy for changes).

## 2. Threat model

Defeats (per 2026-05-13 user decision, options 2+3+4 in the threat-model question):

| Adversary | What we defeat | How |
|---|---|---|
| Casual observer (Etherscan, mempool watcher) | Yes — fully | Time-window batching + denomination bucketing + commitment-based pool entry |
| Automated chain-analysis (Chainalysis, Elliptic) | Mostly | Denomination buckets break amount correlation; epoch batching breaks naive timing correlation. Determined analyst can still recover links via reveal-time secret hashing without ZK. |
| State-level adversary (subpoena, RPC logs, fingerprinting) | No (deferred to v2) | Requires ZK. Architecture leaves space for it; not implemented now. |
| Protocol operator / fee_collector controller | Not in scope | Honest-but-curious assumption. Operator can observe everything that hits the contract. |

**Honesty clause:** the docs / dapp will state these limits clearly. Privacy is opt-in (regular vault is fine for non-private use) and the pool's k-anonymity scales with epoch traffic (small dapp = small anonymity set).

## 3. Architecture: two-mode contract (Pattern A)

```
CyrusTresor1.sol
│
├─ Regular vault (Bank8-identical surface)
│  ├─ depositETH(), depositToken(), deposit() (multi-token batch)
│  ├─ withdrawETH(), withdrawToken()
│  ├─ transferInternalETH(), transferInternalToken(), transferMultipleTokensInternal()
│  ├─ collectFees()
│  ├─ getMyVaultedTokens(), getCurrentFeeInWei(), MAX_BATCH_SIZE, MAX_TOKENS_PER_USER
│  └─ Storage: keccak(user, token, SALT) → uint256 balance  [Bank8 obfuscation, unchanged]
│
└─ Anonymity pool layer (new)
   ├─ commitToPool(commitment, token, bucketIdx)
   ├─ revealFromPool(secret, salt, withdrawTo, token, bucketIdx, [proof])
   ├─ Optional view: poolBalanceForEpoch(epoch, token, bucketIdx)
   └─ Storage: see § 5
```

Bank8 surface is byte-for-byte preserved so existing UI code keeps working unchanged.

## 4. Epoch mechanics

- **Length: 1 hour** (3600 seconds, via `block.timestamp / 3600`). Same across all chains.
- A commitment made in epoch E can be revealed starting from epoch E+1, enforced via `require(epochOf(commitment.depositTime) < currentEpoch())`.
- **Worst-case anonymity**: deposit at 14:59 → reveal eligible at 15:00 (1 minute mixing window). **Best-case**: deposit at 14:00 → reveal eligible at 15:00 (1 hour mixing). Average: ~30 minutes of mixing. Anonymity set = "everyone who deposited the same (token, bucket) in this epoch." Documented honestly in dapp UI.
- **Decided 2026-05-13:** minimum reveal wait = 1 epoch (`require(commitmentDepositEpoch < currentEpoch())`). Trades worst-case mixing strength for cleaner UX. Honest disclosure of "anonymity set = depositors in your epoch" goes in the dapp UI.
- No "settlement transaction" — epoch boundaries are implicit. A user's reveal tx is its own execution. No settler bot, no gas externalization, no centralization vector.

## 5. Denomination buckets

**Configured per chain at deploy time** via constructor params. Each pool-supported token has its own bucket schedule; the contract has no hardcoded values.

```solidity
constructor(
    address feeCollector,
    address priceFeed,                     // Chainlink ETH/USD (or chain-native /USD)
    address[] memory poolTokens,           // address(0) = native ETH/BNB
    uint256[][] memory bucketSchedules     // bucketSchedules[i] = sizes for poolTokens[i]
) { ... }
```

Storage:
```solidity
mapping(address => uint256[]) public poolBucketSizes;   // token => [bucket0, bucket1, ...]
```

Non-bucket-sized pool deposits revert. Users who want non-bucket amounts use the regular vault. There is no automatic split-into-bucket-plus-remainder (would leak identity via the remainder).

Suggested initial deploy values (per chain, finalized in the deploy script — NOT in the contract):

| Chain | Token | Buckets |
|---|---|---|
| Sepolia | ETH | 0.001 / 0.01 / 0.1 / 1.0 |
| Sepolia | USD1 | 10 / 100 / 1000 / 10000 |
| Sepolia | WLFI | 10 / 100 / 1000 / 10000 |
| BSC Testnet | tBNB | 0.005 / 0.05 / 0.5 / 5 |
| Base Sepolia | ETH | 0.001 / 0.01 / 0.1 / 1.0 |

Smaller buckets (0.001 ETH minimum) for testnet so faucet drips can play with the pool. Mainnet deploys later can ratchet up.

## 6. Pool commit/reveal mechanics

### Commit (deposit to pool) — wallet-only source

```solidity
function commitToPool(
    bytes32 commitment,
    address token,         // address(0) = native ETH/BNB
    uint8 bucketIdx
) external payable;
```

- **Source: wallet only.** Pool entries are paid via `msg.value` (ETH/BNB) or `transferFrom(msg.sender, ...)` (ERC-20). There is NO `depositVaultToPool()` function. Why: vault-to-pool would create an on-chain link between the user's vault balance decreasing and the new commitment in the same tx — defeats the whole point.
- For ETH: `msg.value == bucketSize + dynamicFee()`. Excess reverts (no change-giving — leaks identity).
- For ERC-20: `msg.value == dynamicFee()`; ERC-20 amount transferred separately via `transferFrom`, must equal `bucketSize` exactly.
- Fee goes to `fee_collector` (Bank8 model).
- Contract stores: `commitments[commitment] = (token, bucketIdx, depositEpoch, spent=false)`.
- Emits a minimal event: `PoolDeposit(commitment, token, bucketIdx, depositEpoch)`. **No depositor address in the event.**

### Reveal (withdraw from pool)

```solidity
function revealFromPool(
    bytes32 secret,
    bytes32 salt,
    address withdrawTo,
    address token,
    uint8 bucketIdx,
    bytes calldata zkProof  // reserved for v2; ignored in v1
) external;
```

- Compute `commitment = keccak256(abi.encode(secret, salt, withdrawTo, token, bucketIdx, address(this), block.chainid))`.
- Check `commitments[commitment]` exists, was committed in epoch < currentEpoch, and not yet spent.
- Mark spent, transfer `bucketSize` of `token` to `withdrawTo`. **No fee on reveal** — pool fee is paid in full at commit time (see § 7).
- Caller (`msg.sender`) is not necessarily `withdrawTo` — anyone can submit the reveal tx if they have the secret + salt. Enables relayer pattern (depositor pre-pays, anyone broadcasts on behalf of the recipient). The recipient never has to interact with the contract at commit time and never pays a fee at reveal time — just gas.

**Front-running protection:** `withdrawTo` is BAKED INTO the commitment hash. An MEV bot that observes the secret+salt in the mempool cannot redirect funds — changing `withdrawTo` invalidates the commitment. Critical design choice.

### Teleport semantics (UX layer)

`teleport` is **not a separate contract function**. It's a dapp-UI feature on top of `commitToPool`:

1. Sender opens dapp, picks bucket, enters recipient's wallet address.
2. Dapp generates `secret = random(32)` and `salt = random(32)`.
3. Dapp computes `commitment = keccak(secret, salt, recipientAddr, token, bucketIdx)`.
4. Dapp calls `commitToPool(commitment, token, bucketIdx)` with `value = bucketSize + fee`.
5. Dapp produces a claim URI containing `(secret, salt, recipientAddr, token, bucketIdx, txHash)` — shareable as QR code, message, link.
6. Recipient opens claim URI in their wallet (via dapp deeplink), the dapp constructs and broadcasts `revealFromPool(...)` from recipient's wallet — funds land in `recipientAddr`.

This keeps the contract minimal. All UX complexity lives in the dapp.

## 7. Fee model — commit-only, "pay forward"

- **Dynamic fee** (Bank8's Chainlink-based ~$0.10 USD) is charged **only at commit time**.
- **Reveal is free** of contract-level fees (msg.sender still pays gas, but the contract doesn't take a cut).
- Why: enables the teleport UX cleanly — depositor pays once at commit, recipient claims for free. Also lets a relayer broadcast the reveal tx without having to pre-fund a fee budget. Operator earns the same total per pool cycle (one fee per commitment, no matter when reveal happens).
- Regular vault ops (Bank8 path) keep the existing per-op fee model — unchanged.

## 8. Storage scoping (Portal11 lesson #3)

All pool storage is keyed by `commitment` (a 32-byte hash), never by `address user`. The Portal11 bug "`_clearPrivacyStorage()` deletes all users' data" cannot recur here because:

- There is no global "all commitments" array that could be wiped.
- There is no per-user index into commitments (commitment is opaque to identity).
- Spending a commitment only marks `commitments[c].spent = true` for that one key.

Regular-vault storage is unchanged from Bank8 (keccak(user, token, SALT) → balance), which is already per-user safe.

## 9. MEV / replay protection

**Commitment preimage layout** (decided):

```solidity
commitment = keccak256(abi.encode(
    secret,         // bytes32, user-side entropy, dapp generates 256-bit random
    salt,           // bytes32, additional user-side entropy
    withdrawTo,     // address, baked in to prevent reveal front-running
    token,          // address, binds commitment to specific token
    bucketIdx,      // uint8, binds commitment to specific bucket size
    address(this),  // binds commitment to THIS contract instance
    block.chainid   // binds commitment to THIS chain (belt-and-suspenders)
));
```

Protections this provides:

- **Reveal front-running:** an observer who sees `(secret, salt)` in the mempool cannot redirect funds — changing `withdrawTo` invalidates the commitment.
- **Cross-chain replay:** a leaked secret on Sepolia cannot be re-revealed on a different chain (Base / BSC) because `block.chainid` differs.
- **Cross-contract replay (e.g., v1 ↔ v2 on same chain):** `address(this)` differs between deployments.
- **Bucket-mismatch attack:** an attacker who tries to reveal with a different bucketIdx pays out the wrong amount — the keccak doesn't match.

**Commitment collision:** keccak256 collision-resistance is the trust root; dapp MUST generate 256-bit cryptographically random secrets (Web Crypto API `getRandomValues`).

## 10. ZK extensibility (v2 hook)

- `revealFromPool` accepts a `bytes calldata zkProof` parameter that is unused in v1.
- Storage reserves an **immutable** slot for `address zkVerifier`, set in the constructor:
  - v1 deployments pass `address(0)` → secret/salt path is enforced, proof param ignored.
  - v2 deployments will pass a real verifier contract address → proof path is enforced, secret/salt args ignored.
- **Decided 2026-05-13:** `zkVerifier` is **constructor-immutable**. To enable ZK later, deploy `CyrusTresor2`. Users migrate by revealing from v1 (using secret+salt) and re-committing to v2 (using ZK proof generation in the dapp). Zero admin keys, zero post-deploy attack surface.
- Alternative considered (rejected): admin-settable `setVerifier()` with `onlyOwner`. Rejected because (a) owner key is a centralization vector that survives in storage forever, (b) migration cost saved is small (1 reveal + 1 commit per user), (c) project values immutability over flexibility (per workflow_rules.md).

## 11. Multi-chain considerations

- Same independent-per-chain deploy model as Bank8.
- No cross-chain commits/reveals. A commit on Sepolia can only be revealed on Sepolia.
- Each chain has its own bucket schedule (in § 5) — token addresses differ per chain.

## 12. Naming

**Decided: `CyrusTresor1.sol`.** Matches the user's "tresor" vision language. Breaks the `CrossChainBank*` numbering deliberately — this is a new kind of contract, not Bank9. Frontend / ABI naming convention will follow:

- Source: `contracts/evm/CyrusTresor1.sol`
- ABI: `src/contracts/abis/CyrusTresor1.json` and (mirror) `tools/contract-debug/abis/CyrusTresor1.json`
- Deploy addresses in `.env`: `VITE_CTGTRESOR_ETH_TESTNET_CONTRACT`, etc. (parallel naming to existing `VITE_CTGVAULT_*` for Bank8)

---

## Implementation handoff

Spec is implementation-ready as of 2026-05-13. Suggested next-session workflow:

1. **Scaffold** `contracts/evm/CyrusTresor1.sol`. Start by copying `CrossChainBank8.sol` whole — the regular-vault surface is identical.
2. **Add pool layer.** Storage (`commitments` mapping, `poolBucketSizes`), then `commitToPool()`, then `revealFromPool()`. Each function gets its own commit per Rule 1.
3. **Tests first** per Rule 3. Hardhat unit tests for: commit/reveal happy path, reveal-before-epoch reverts, reveal-with-wrong-bucket reverts, reveal-with-wrong-withdrawTo reverts (= MEV protection), reveal-twice reverts (= double-spend), commit-with-non-bucket-amount reverts.
4. **Deploy to Sepolia** using fixed `tools/hardhat-deploy/deploy_contracts4.sh` (P1 from session_2026-05-09 TODO).
5. **Add to debug UI** — third tab `CyrusTresor1`, with test cards covering each function. Verify on real Sepolia per Rule 2.
6. **Update frontend** — new "Anonymity Pool" mode in the dapp UI with the teleport URI flow.

## Decisions log (in chronological order)

- 2026-05-13: Threat model = mix of options 2+3+4 (chain analyst defense MVP + state-level extensibility hook + teleport feature + time-window batching).
- 2026-05-13: Architecture = Pattern A (Bank8 base + pool layer, side-by-side).
- 2026-05-13: Epoch length = 1 hour.
- 2026-05-13: Denominations = fixed token-native buckets (not USD-pegged; saves Chainlink dependency in the pool path).
- 2026-05-13: Teleport is a UX layer, not a contract function. Contract just exposes commit/reveal.
- 2026-05-13: Front-running protection = `withdrawTo` baked into commitment hash.
- 2026-05-13: All pool storage keyed by commitment hash, never by user address.
- 2026-05-13: Bucket sizes = configurable per chain at deploy time (constructor params), not hardcoded.
- 2026-05-13: Pool fees = commit-only, "pay forward" (reveal is contract-free, msg.sender pays only gas).
- 2026-05-13: Pool entry source = wallet-only. No `depositVaultToPool()`.
- 2026-05-13: Contract name = `CyrusTresor1.sol`.
- 2026-05-13: Reveal wait = 1 epoch minimum (`currentEpoch > depositEpoch`).
- 2026-05-13: ZK verifier = constructor-immutable; v2 = new contract address; users migrate manually.
