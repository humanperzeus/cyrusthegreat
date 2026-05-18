# Audit RFP — CyrusTresor1 (cyrusthegreat.dev)

**Date drafted:** 2026-05-19
**Project:** Multi-chain privacy vault with opt-in anonymity pool
**Engagement type:** Security audit + post-fix re-review
**Target mainnet launch:** Q3 2026 (adjustable based on firm availability)

---

## 1. Project overview

`cyrusthegreat.dev` is a multi-chain Web3 vault dapp. Users deposit ETH/ERC-20s
into per-address obfuscated balances and can withdraw, transfer internally, or —
new in this version — opt into a **time-window + denomination-bucket anonymity
pool** with `teleport()`-style claim semantics for paying recipients.

Live since 2026-05-09: the Bank8 regular-vault surface on Sepolia / BSC Testnet /
Base Sepolia. Frontend at https://cyrusthegreat.dev .

**Audit scope is the new `CyrusTresor1.sol` contract**, which preserves the
Bank8 surface byte-for-byte and adds the pool layer on top.

## 2. Contract scope

| File | LOC | Status |
|---|---|---|
| `contracts/evm/CyrusTresor1.sol` | 833 | **Primary audit target.** Bank8 base + commit/reveal pool layer. |
| `contracts/evm/CrossChainBank8.sol` | 611 | Already live since 2026-05-09. Audit scope: confirm CyrusTresor1's preservation of the Bank8 surface is byte-faithful (not a re-audit of Bank8 itself, but verify no regressions). |
| `contracts/evm/TestToken.sol` | 28 | Mock ERC-20 for tests only; OUT OF SCOPE for audit. |
| **Total in-scope SLOC** | **~830** | |

Solidity `^0.8.20`, compiled with solc `0.8.27` + optimizer (200 runs).

Dependencies (audit out of scope, assumed audited upstream):
- `@openzeppelin/contracts ^4.9.6` — ReentrancyGuard, IERC20, SafeERC20
- `@chainlink/contracts ^1.2.0` — AggregatorV3Interface (price feed for $0.10
  dynamic fee)

## 3. What the contract does (1-paragraph summary)

CyrusTresor1 = two modes side-by-side. (1) The **regular vault** = direct
`deposit / withdraw / transferInternal` for ETH and any ERC-20, with per-address
obfuscated balances via `keccak256(user, token, SALT)`, dynamic ~$0.10 fee per
operation. (2) The **anonymity pool** = commit/reveal via `commitToPool` (locks
funds against a `bytes32` commitment hash) and `revealFromPool` (anyone with the
secret can claim to a baked-in `withdrawTo`). Buckets are configured at deploy
(fixed denominations like 0.001/0.01/0.1/1 ETH). Epochs are 1 hour; reveals
require `currentEpoch > depositEpoch`. Fees are charged at commit time only
(reveals are contract-fee-free, enabling teleport UX where the recipient pays
just gas).

## 4. Threat model (what we want the audit to validate)

In scope of the contract's design:

- **k-anonymity within an (epoch × bucket × token) cohort** against casual
  block-explorer watchers and AUTOMATED chain analysis. Documented openly to
  users; we do NOT claim cryptographic anonymity.
- **MEV-resistance on reveal**: the `withdrawTo` address is baked into the
  commitment hash — an observer who sees the secret in the mempool cannot
  redirect funds.
- **Cross-chain replay protection**: `address(this)` and `block.chainid` are in
  the commitment preimage.
- **Storage scoping**: every pool storage write is keyed by `commitment` (a
  32-byte hash). NO global mutable state that one user can wipe for everyone
  (an explicit lesson from the predecessor `CyrusPortal11` design we abandoned —
  its `_clearPrivacyStorage()` had a per-user-scope bug).
- **No admin keys** post-deploy. `feeCollector` and `zkVerifier` are
  constructor-immutable. No upgrade proxy.

Explicitly NOT in scope (the contract makes no such claim):

- Full cryptographic anonymity against a state-level adversary. v2 (`CyrusTresor2`)
  will add ZK proofs for this; out of scope here.
- ZK-circuit security review. The `zkProof` parameter exists in the v1 ABI as a
  forward-compat slot but is unused (v1 deployments set `zkVerifier = address(0)`).
- Off-chain components: the React frontend, the teleport URI codec, the deploy
  scripts. We can include the JS commitment-hash computation in scope if the
  firm wants — it must match the contract's keccak256 layout exactly, and a
  mismatch would be catastrophic for users.

## 5. Current testing state

Three independent verification layers all green on Sepolia 2026-05-17:

1. **Foundry unit suite**: `tools/foundry-tests/test/CyrusTresor1.t.sol`
   — 27 tests passing in ~5ms. Covers constructor validation, view assertions,
   commitToPool reverts (reuse, bad bucket, wrong msg.value, ERC-20 path),
   revealFromPool reverts (same-epoch, unknown, MEV-redirect, double-spend, zero
   withdrawTo, wrong bucket).
2. **On-chain `ct-test` matrix**: 8 test cards in `tools/contract-debug/index.html`
   covering each surface against the real deployed contract. All 8 verified by
   user 2026-05-17 with real txs (e.g., commit `0xf181d72a…`, reveal
   `0x79e50e37…`, double-spend revert `0x...`).
3. **Multi-chain deploys verified on block explorers**:
   - Sepolia: `0x223E25F961E29AaCc3dB49e5b00B30452D42c65e`
   - BSC Testnet: `0xa2D2A04d6eE5887f20bF736E1d9014727d599F39`
   - Base Sepolia: `0xc90610ce4DE152349932Af102650b6c9f8C6AD68`
   Bytecode source-verified on Etherscan / BSCScan / BaseScan.

## 6. Design documentation

- **`docs/cyrustresor1_spec.md`** (248 lines) — paper spec, design decision log,
  threat model, all bucket/epoch/MEV/storage/ZK design choices justified.
- **`tech_learnings.md`** — L-006 to L-010 are universal patterns extracted from
  this project's predecessors (especially Portal11's 4 known bugs, which informed
  the storage-scoping discipline in CyrusTresor1).
- **`memory/session_2026-05-13.md`** + **`session_2026-05-14.md`** +
  **`session_2026-05-17.md`** — session logs documenting design + verification
  decisions.

All linked from the GitHub repo: https://github.com/humanperzeus/cyrusthegreat

## 7. Engagement asks

We're soliciting proposals for:

| Item | Asked deliverable |
|---|---|
| Initial audit | Written report with findings categorized by severity (critical / high / medium / low / informational), each with reproducer / impact / recommendation |
| Remediation re-review | Quick re-audit after we fix critical / high / medium findings (typically 20-30% of original cost) |
| Optional: ABI / event sanity | Confirm off-chain JS commitment computation (`src/lib/poolURI.ts`) matches the contract layout — small (~190 LOC) but catastrophic if drifted |
| Communication channel | GitHub PRs + a private Slack / Telegram / Signal channel for live findings |

Out of scope unless explicitly added:
- Frontend security review
- ZK-circuit work (deferred to v2)
- Deploy-process review (we have our own checklist at `docs/MAINNET_DEPLOY_CHECKLIST.md`)

## 8. Timeline expectation

Open to firm availability — we have NOT pre-committed to a specific calendar
date. Realistic shape:

- Quote / proposal: 1-2 weeks after this RFP
- Engagement start: as soon as possible after acceptance
- Audit duration: 2-4 weeks (per firm scope estimate)
- Remediation by us: 1-2 weeks after report
- Re-audit: 1 week
- **Earliest mainnet launch**: ~7-9 weeks after engagement start

If the firm has a hard backlog of 2-3 months that's fine, we'll wait — we are
not interested in rushing this. Tornado Cash precedent is explicit on the legal
exposure of an under-audited privacy protocol.

## 9. Budget range

Expecting **$40,000 — $150,000 USD** depending on firm + scope detail. Open to
fixed-price OR daily-rate × estimate. We will pick the proposal best balancing
reputation, prior privacy-protocol experience, and value — not strictly lowest
price.

Payment in fiat (USD wire) or stablecoin (USDC on Ethereum or Base). Standard
50% upfront / 50% on delivery split is fine.

## 10. About the team + legal posture

- Solo owner-developer (cyrus-the-great is a single-founder project).
- Pre-launch — no token, no users, no real money on mainnet yet.
- Foundation jurisdiction not yet selected (per `MAINNET_DEPLOY_CHECKLIST.md § A`
  this is a Tier 2 critical-path item independent of the audit). Crypto-specialist
  counsel to be engaged in parallel with this audit.
- **Honest disclosure**: this protocol is in the same family as Tornado Cash
  semantically. We will not pitch it as "untraceable money" or "anonymous
  payments" — the UI explicitly states k-anonymity-only and warns users. Firms
  with internal policy against privacy-protocol engagement should pass.

## 11. Firms we're approaching first (no implied preference)

In alphabetical order, all on our shortlist based on prior privacy-protocol or
DeFi audit reputation:

- Code4rena (competitive contest model)
- Consensys Diligence
- OpenZeppelin
- Spearbit
- Trail of Bits

We're sending this RFP to all five simultaneously. We'll choose based on
proposals received within 2 weeks. Cantina, Halborn, Hacken, Quantstamp,
Sherlock welcome to submit unsolicited if interested.

## 12. Contact

GitHub: https://github.com/humanperzeus/cyrusthegreat
Email: human@humankhoobsirat.com

Please respond with:
1. Estimated scope (person-days / weeks) given the LOC + complexity above
2. Proposed fixed price OR daily rate
3. Earliest engagement start window
4. Comparable prior engagements (privacy / mixer / vault protocols)
5. Sample report from a comparable engagement (if public)

---

**Repository contents the audit team will work from**:
- Branch `sync-2026-05-13` on GitHub (39+ commits, all single-intent, clean history)
- Once engagement starts, we'll cut a stable audit tag (e.g. `audit-2026-Q3`)
  pinning the exact commit reviewed.

**File pointer**: this RFP lives in the repo at
`docs/AUDIT_RFP.md` so the audit team can verify it's the same project once they
clone.
