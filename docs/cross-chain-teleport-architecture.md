# Cross-chain CyrusTeleport — Architecture v0

**Status**: design proposal, awaiting user sign-off before code.
**Date**: 2026-06-18.
**Author**: solo-dev session w/ Claude.

## 0 · Context

Single-chain CyrusTeleport (`CyrusTresor1`) is live across 5 testnets (Sepolia, BSC, Base, Arbitrum, HyperEVM). Users commit and reveal on the **same chain**. The cross-chain extension lets a user commit on chain A and reveal on chain B — making CyrusTeleport the first multi-chain commit-reveal privacy pool.

Decisions already made (this session):

- **Messaging layer**: LayerZero v2 (`endpoint v2 + DVN model`)
- **First chain pair**: Sepolia ↔ Base Sepolia
- **Goal for v1**: stablecoin teleports (USD1 + USDC + USDT once mainnet) work end-to-end across the chosen pair. Native ETH works too.
- **Non-goals for v1**: cross-chain composability with non-EVM, sub-second finality, multi-hop (A → B → C), per-tx liquidity bridging (see §3).

## 1 · Current single-chain model (recap)

The commit-reveal flow today:

```
chain A:
  user → commitToPool(commitment, token, bucketIdx)
       msg.value = native + protocol fee
  contract: stores commitment + epoch, takes the bucketSize either as
            msg.value (native) or via transferFrom (ERC-20)
  
  [WAIT ≥ 1 epoch on chain A]
  
  user → revealFromPool(secret, userSalt, withdrawTo, token, bucketIdx, zkProof='0x')
  contract: verifies commitment_hash == hash(secret, userSalt, withdrawTo, token, bucketIdx, contract, chainId)
            transfers bucketSize from contract to withdrawTo
            marks commitment as spent
```

Everything is local to one chain. The commitment hash already includes `contractAddress + chainId` so cross-chain replay is impossible by construction.

See `docs/cyrustresor1_spec.md` for the canonical single-chain spec.

## 2 · Cross-chain target — three liquidity models

The fundamental question: when a user reveals on chain B, **where do the tokens come from**? Three viable models:

### 2.1 Pre-funded LP on both chains (Recommended)

We (the protocol operator) hold inventory of the same asset on both chains. Commit pulls tokens into the pool on chain A; reveal releases tokens from the pool on chain B. The LayerZero message just carries the authorization — no tokens move cross-chain.

```
chain A:                              chain B:
  pool[A] holds USDC                    pool[B] holds USDC
  user deposits USDC into pool[A]       LayerZero message arrives
  LayerZero sends "commitment X         pool[B] marks commitment X
    is authorized" to chain B            as redeemable
                                        user reveals → pool[B] sends
                                          USDC to withdrawTo
```

**Pros**:
- No tokens cross chains → no bridge attack surface for funds
- Fast (LayerZero message is the only cross-chain primitive)
- Works for ANY ERC-20 (USDC, USDT, USD1, WLFI, etc.) — not just OFT-compliant ones
- Rebalancing is async + off-chain

**Cons**:
- Capital lockup (we provide initial LP on every supported chain)
- LP can run dry → reveals revert until we rebalance
- "Same asset" assumption requires canonical mapping per chain (USDC on Sepolia → USDC on Base Sepolia)

### 2.2 LayerZero OFT (burn-on-A, mint-on-B)

The token itself becomes cross-chain via LayerZero's OFT (Omnichain Fungible Token) standard. Commit on A burns the user's tokens; reveal on B mints fresh tokens.

**Pros**:
- No LP inventory needed
- True 1:1 token equivalence

**Cons**:
- **Only works for OFT-compliant tokens** — USDC, USDT, USD1 are NOT OFT. Would require either deploying our own OFT wrapper (one more attack surface) or convincing Circle/Tether to adopt.
- Wrapping a token adds depeg risk + a redemption step.
- Killed as v1 option by the constraint set.

### 2.3 Per-tx bridge via LayerZero

User commits on A, LayerZero bridges the actual tokens cross-chain, user reveals on B with the bridged tokens.

**Pros**:
- No LP inventory
- No OFT requirement (bridging works for any token via LayerZero's wrappers)

**Cons**:
- Slow (LayerZero finality + bridge transfer + epoch wait)
- Expensive (per-tx bridge gas + LayerZero fees)
- **Breaks anonymity** — the bridge transfer creates a public on-chain link between the chain-A and chain-B activity, defeating the privacy guarantee CyrusTeleport exists to provide
- Killed by the privacy property.

**Decision**: §2.1 (pre-funded LP). It's the only model that preserves the privacy property AND works with non-OFT stablecoins. Same model Across uses, well-understood in the bridge space.

## 3 · End-to-end flow (cross-chain commit + reveal)

```
chain A (Sepolia)                        chain B (Base Sepolia)
─────────────────────                    ─────────────────────────
user → CyrusTresor1.commitToPoolCross(   
         commitment,
         token,
         bucketIdx,
         dstEid,           ← LayerZero endpoint ID for chain B
         lzGasOptions      ← gas the user pays for the LZ message
       )
       msg.value = native + protocol fee + LZ message fee
                                          
contract:
  • takes bucketSize from user
    (native via msg.value, ERC-20 via transferFrom)
  • emits CommitToPool event
  • calls lzSend(dstEid, payload, options)
    payload = abi.encode(commitment, token, bucketIdx,
                          bucketSizeWei, currentEpochOnA)
                                          
                            [LayerZero DVN(s) verify the message]
                            [Executor delivers to chain B — ~30-90s]
                                          
                                          contract.lzReceive(payload):
                                            decodes commitment + metadata
                                            stores commitment with
                                              eligibleAt = block.timestamp + 1 hr
                                            emits CrossChainCommitReceived
                                          
[notebook entry on chain A is updated to        notebook also tracks
 "awaiting reveal on chain B"]                  the destination claim

[wait until eligibleAt timestamp passes]

                                          user → revealFromPool(
                                                   secret,
                                                   userSalt,
                                                   withdrawTo,
                                                   token (chain-B canonical),
                                                   bucketIdx,
                                                   '0x' zkProof
                                                 )
                                          contract:
                                            verifies commitment_hash
                                            confirms commitment is
                                              cross-chain-received
                                            confirms eligibleAt < now
                                            transfers bucketSize from
                                              pool[B] LP to withdrawTo
                                            marks commitment spent
                                            emits Reveal
```

Key invariant: the commitment_hash is computed identically on both chains. Both must agree on `hash(secret, userSalt, withdrawTo, token, bucketIdx, contractAddress, chainId)`. **Which `chainId` and `contractAddress`?** The DESTINATION chain (B) — so the recipient computes against the chain-B contract, and the cross-chain message is what tells chain B's contract that this commitment is valid.

## 4 · Contract surface changes

### 4.1 New functions on CyrusTresor v2

```solidity
// Chain A (source)
function commitToPoolCross(
    bytes32 commitment,
    address token,
    uint256 bucketIdx,
    uint32 dstEid,
    bytes calldata lzOptions
) external payable;

// Chain B (destination) — called by LayerZero only
function lzReceive(
    Origin calldata origin,
    bytes32 guid,
    bytes calldata payload,
    address executor,
    bytes calldata extraData
) external;
// Inside: decodes payload, registers commitment in local mapping
// with eligibleAt = now + WAIT_SECONDS

// Refund path on chain A — for stuck cross-chain commits
function refundExpiredCommit(bytes32 commitment) external;
// Callable after REFUND_TIMEOUT (e.g., 24h) if the LZ message never
// arrived. Pays back bucketSize to msg.sender (must equal original
// committer — tracked via a per-commit `sender` field on chain A).
```

### 4.2 Existing functions kept

- `commitToPool` — single-chain path stays intact, default for users not selecting a destination chain
- `revealFromPool` — single-chain reveal stays intact
- `currentFee`, `currentEpoch`, `getPoolBucketSizes` — unchanged

### 4.3 New storage

```solidity
// On chain A:
mapping(bytes32 => CrossChainCommit) public crossChainCommits;
struct CrossChainCommit {
    address committer;         // for refund routing
    uint64  initiatedAt;       // for refund-eligibility check
    uint32  dstEid;            // for refund event indexing
    bool    refunded;          // prevent double-refund
}

// On chain B:
mapping(bytes32 => InboundCommit) public inboundCommits;
struct InboundCommit {
    uint64  eligibleAt;        // block.timestamp + WAIT_SECONDS
    address token;             // chain-B token address
    uint256 bucketIdx;
    bool    spent;             // mirrors single-chain `spent` flag
}
```

### 4.4 LP inventory

Pool contract holds the canonical asset on each chain. Funded by the operator via a separate `fundLP(address token, uint256 amount)` admin function (the deploy script seeds this). Withdrawals from the LP (rebalancing) gated behind `onlyOwner`.

## 5 · LayerZero v2 integration specifics

### 5.1 Endpoint addresses

Hardcoded per chain in the contract constructor:

| Chain | Endpoint v2 | EID |
|---|---|---|
| Sepolia | `0x6EDCE65403992e310A62460808c4b910D972f10f` | `40161` |
| Base Sepolia | `0x6EDCE65403992e310A62460808c4b910D972f10f` | `40245` |

(Addresses to verify against `https://docs.layerzero.network/v2/deployments/deployed-contracts` at deploy time.)

### 5.2 DVN (Decentralized Verifier Network) config

For v1: use LayerZero's default DVN set. For mainnet upgrade: configure 2-of-3 (LayerZero Labs + Polyhedra + Nethermind) for higher security. Documented in `MAINNET_DEPLOY_CHECKLIST.md` extension.

### 5.3 Executor config

Use the default executor. User pays gas on chain B via `lzOptions` constructed with `addExecutorLzReceiveOption(gasLimit, value)`.

### 5.4 Message payload format

```
payload = abi.encode(
    bytes32 commitment,
    address tokenOnB,
    uint256 bucketIdx,
    uint256 bucketSizeWei,
    uint64  sourceEpoch
)
```

Total payload size: 5 × 32 bytes = 160 bytes. Well within LayerZero's default 12 KB limit.

## 6 · Fee model

The user pays ONE consolidated fee at commit-time, broken down internally:

```
totalFee = protocolFee (existing, dynamic)
         + lzMessageFee (LayerZero v2 quote, dynamic per chain pair)
         + bridgeSpread (LP capital efficiency, 0.1-0.3% suggested for v1)
```

UI shows: `Cross-chain teleport · 100 USDC → Base Sepolia · fee 0.42 USDC (0.42%)`. Itemized on hover.

`lzMessageFee` queried via `endpoint.quote(dstEid, message, options, false)` before submission. UI refreshes the quote every 15s while the user is on the commit page.

## 7 · Failure modes + refund path

### 7.1 LayerZero message fails to deliver

The DVN(s) verify but the executor fails (gas too low, chain B contract reverts, etc.). LayerZero v2 supports `retry` and `clear`:

1. **Auto-retry**: executor will retry up to N times automatically
2. **Manual retry**: user (or anyone) can call `endpoint.lzReceiveRetry` to force delivery
3. **Refund**: after `REFUND_TIMEOUT` (suggested 24h), original committer can call `refundExpiredCommit(commitment)` on chain A to get bucketSize back. Protocol fee is NOT refunded (it covered the failed-message gas).

### 7.2 LP on chain B is empty

Reveal reverts with `InsufficientLP`. User's commitment is preserved on chain B — they can retry later after we rebalance. The protocol fee + LZ fee are NOT lost (already paid on chain A).

### 7.3 Token decimals mismatch

Sepolia USDC = 6 decimals; Base Sepolia USDC = 6 decimals. Same on mainnet. We hardcode the decimal expectation per chain pair; if a future pair has a mismatch, the bridge spread converts (with explicit UX warning).

### 7.4 Race condition: user reveals on B before message arrives

Reveal reverts cleanly with `CommitmentNotReceived`. User waits, retries. No funds at risk.

## 8 · Epoch synchronization

Single-chain: each chain has its own epoch counter. Cross-chain: chain B doesn't have chain A's epoch. We use **wall-clock time** for cross-chain commitments:

```
on chain B's lzReceive:
    eligibleAt = block.timestamp + WAIT_SECONDS;   // e.g., 3600 = 1 hr
```

`WAIT_SECONDS` is hardcoded in the contract (changeable only via redeploy). For v1: 3600 (1 hour), matching the single-chain epoch length. This trades some anonymity-set precision (cross-chain reveals don't bucket perfectly with single-chain reveals in the same epoch) for simplicity.

## 9 · UI changes preview

(Pixel-faithful mockups to follow before code.)

CommitForm gets a new section above the "Flow" tabs:

```
┌─ Destination ───────────────────────┐
│ ○ Same chain (Sepolia)              │
│ ● Cross-chain → Base Sepolia        │
│   Time to claim: ~1 minute + 1 hr   │
│   Fee: 0.42 USDC                    │
└─────────────────────────────────────┘
```

Notebook entries gain a chip showing destination chain:

```
[Ready]  100 USDC → Base · 0xabcd…ef12      [Reveal on Base ↗]
[2h 14m] 50 USDC → Sepolia · 0x9c11…b720    [wait]
```

Reveal button on cross-chain entries auto-switches the wallet to the destination chain (Rabby prompt) before submitting.

/claim page handles cross-chain claim URLs identically — the URL already encodes `chainId`, so the page knows which chain to reveal on.

## 10 · Testnet deploy plan

```
1. Audit-light pass on CyrusTresor v2 (cross-chain additions only,
   single-chain code is already deployed unchanged)
2. Deploy CyrusTresor v2 on Sepolia with LayerZero endpoint wired
3. Deploy CyrusTresor v2 on Base Sepolia with LayerZero endpoint wired
4. Pair the two contracts via setPeer() (each contract trusts the other)
5. Fund LP on Base Sepolia (e.g., 10,000 USDC test, 10 test-ETH)
6. End-to-end test from a single wallet:
   a. commit 100 USDC on Sepolia with dstEid=BaseSepolia
   b. monitor LayerZero scan (testnet.layerzeroscan.com) for delivery
   c. wait 1 hour
   d. switch wallet to Base Sepolia
   e. reveal → confirm 100 USDC lands at withdrawTo
7. Refund test: commit with extremely low lzOptions gas → message
   fails delivery → wait 24h → refundExpiredCommit
8. Empty-LP test: drain LP → confirm reveal reverts cleanly with
   InsufficientLP error
9. Soak test: 10 commits in 1 hour, mix of self-pay and teleport-to-other
```

## 11 · Audit scope

The single-chain CyrusTresor1 is already in production (testnet-only). Cross-chain additions add a NEW attack surface that needs separate audit:

- `commitToPoolCross` — payload encoding, LZ fee accounting
- `lzReceive` — payload decoding, replay prevention, peer trust check
- `refundExpiredCommit` — sender check, timeout enforcement, double-refund prevention
- LP admin functions — withdrawal authorization
- Cross-chain commitment verification — same hash on both chains

Estimated audit cost: **$25-40k** for a focused 2-3 week audit by a firm with LayerZero v2 experience (Spearbit, Code4rena, Cantina, OpenZeppelin). Mainnet launch should be gated on this audit completing clean.

## 12 · Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| LayerZero outage / DVN failure | Low | Reveals stuck (recoverable via refund) | 24h refund path |
| LP drain on chain B | Medium (early) | Reveals revert until rebalanced | Monitoring + auto-alerts, manual rebalance v1 |
| Cross-chain front-running | Low | None (commitment hash already MEV-safe) | Built into design via commitment-hash scheme |
| Token decimals mismatch on future pairs | Low for stables | Wrong amount delivered | Hardcoded per pair, explicit UX warning |
| Operator compromise (LP withdrawal) | Low | LP funds drained | Multisig on operator key, time-lock on LP withdrawals |
| LayerZero contract upgrade breaks integration | Low | Cross-chain stops working | Pin endpoint version in deploy, monitor LZ announcements |

## 13 · Open questions for user

Before code starts:

1. **LP capital commitment**: how much per chain pair are you willing to lock as initial inventory? Suggest starting with 10k testnet equivalent per asset (low cost on testnet, large enough for soak testing).
2. **Bridge spread**: 0.1% / 0.2% / 0.3%? Tradeoff is competitive position vs LP capital efficiency. Across charges 0.1-0.25%.
3. **Refund timeout**: 24h is conservative. Stargate uses ~1 hour. Suggest 6 hours as v1 middle ground.
4. **Audit firm preference**: any prior relationships or hard preferences? Otherwise I'll suggest 2-3 quote candidates.
5. **Mainnet deploy timing**: target a specific event (conf talk, funding round) or "when ready"?

## 14 · Next actions (in order)

Once this doc is approved:

1. **Pixel-faithful UI mockups** for the cross-chain flow (CommitForm destination section, Notebook destination chip, /claim cross-chain handling) — user reviews before any Solidity changes
2. **Solidity v2 contract** as a new file (`CyrusTresor2.sol`) — single-chain code copied verbatim, cross-chain additions appended. Single-chain v1 stays running unmodified until v2 is audit-clean
3. **Local dev setup** with LayerZero v2 mock endpoint + Foundry tests for the cross-chain flow
4. **Deploy scripts** for both Sepolia and Base Sepolia
5. **First cross-chain testnet commit** — end-to-end demo
6. **Audit RFP** sent to 2-3 firms
7. **UI integration** wired against the deployed contracts
8. **Public testnet announcement** with the demo

Realistic timeline (focused effort, no parallel projects): **8-10 weeks** from doc approval to public testnet demo. Mainnet adds another 6-12 weeks (audit + audit response + mainnet deploy + LP funding).

---

**Action required from user**: review §13's open questions + sign off (or redirect) the §2 liquidity-model decision. After that, the next deliverable is the pixel-faithful UI mockups in §14.1.
