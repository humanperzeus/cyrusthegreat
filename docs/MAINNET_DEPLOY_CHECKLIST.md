# Mainnet deploy checklist — CyrusTresor1 (or successor)

**Status:** PRE-DEPLOY. Nothing has been deployed to a mainnet yet. This doc
captures everything that must be true before a `--network <mainnet>` invocation
is allowed.

The current testnet deploys (Sepolia / BSC Testnet / Base Sepolia) are NOT
intended for promotion. A mainnet deploy = fresh deploy with mainnet-specific
constructor args and a DIFFERENT (production) feeCollector.

---

## Section A — Privacy / legal preconditions

These are NON-NEGOTIABLE. Skip any and you risk a Roman-Storm-style outcome.

- [ ] **Decide which version ships to mainnet first.** Options:
  - **A1.** CyrusTresor1 (current) — k-anonymity only. Honest disclaimer
    required in UI. Lower regulatory risk because we're not pitching
    "untraceable" — we're pitching "convenient pool with weak anonymity."
  - **A2.** CyrusTresor1.1 (multi-round mixing port from Portal11) — still
    not ZK; same disclaimer requirement.
  - **A3.** CyrusTresor2 (full ZK) — months of work + audit. Real anonymity
    claim → real legal exposure (Tornado precedent).
- [ ] **Jurisdiction decision.** US-based mainnet launch of a privacy
  protocol is high-risk after Tornado Cash. Recommended: foundation in
  Cayman / Liechtenstein / Switzerland Crypto Valley before mainnet deploy.
- [ ] **Real lawyer engaged.** Crypto-specialist counsel reviewed the
  contracts + UI copy + whitepaper before any launch announcement.
- [ ] **Privacy disclaimer copy approved.** The dapp UI must state
  EXPLICITLY: "k-anonymity only; not cryptographic anonymity; determined
  chain analysts can recover deposit→reveal links. v2 ZK upgrade in
  development."
- [ ] **OFAC / sanctioned-jurisdiction policy.** Decide before launch:
  block known sanctioned addresses at the dapp UI level (frontend only —
  contract is permissionless). Document the policy publicly.

## Section B — Smart contract preconditions

- [ ] **Source code audited** by a reputable firm. Budget $80K-$150K for
  the current ~830-line contract; expect 4-8 weeks. Recommended firms:
  Trail of Bits, ConsenSys Diligence, OpenZeppelin, Spearbit, Code4rena
  contest format.
- [ ] **Audit findings remediated.** All critical / high / medium issues
  addressed. Re-audit if changes were substantial.
- [ ] **Re-deployed fresh contract** for mainnet. NEVER reuse the testnet
  deploy address — different chain, different storage layout possible if
  upgraded, different feeCollector.
- [ ] **Bytecode reproducibility.** Anyone can compile our source with
  the documented solc version + settings and arrive at the same deployed
  bytecode. Document the exact toolchain in `docs/mainnet-build.md`.

## Section C — Constructor params for mainnet

- [ ] **New feeCollector address** = production multisig (NOT the dev
  WALLET1). Recommended: 2-of-3 or 3-of-5 Safe (gnosis-safe.io) with
  geographically-distributed signers.
- [ ] **`salt`** = freshly generated `openssl rand -hex 32`. NEVER reuse
  a testnet salt; the contract uses this in the obfuscated balance key,
  and reusing it on mainnet would link mainnet activity to testnet activity
  for anyone who knows the salt (we do — it's in the deploy record).
- [ ] **`priceFeed`** = correct mainnet Chainlink address for the chain:
  - Ethereum mainnet ETH/USD: `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`
  - Base mainnet ETH/USD: `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70`
  - BSC mainnet BNB/USD: `0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE`
  - Optimism / Arbitrum / Hyperliquid: look up at docs.chain.link
- [ ] **`poolTokens` + `bucketSchedules`** — STABLECOIN-FIRST per the 2026-05-18
  scope decision. Bucket math is cleanest when amounts are USD-denominated;
  larger volume per token = larger k-anonymity sets per (bucket × epoch).
  Suggested mainnet first deploy (small + conservative — can ratchet up later):
  - **ETH**  buckets 0.01 / 0.1 / 1 / 10 ETH (testnet was 0.001-1; mainnet floor higher to keep dust out of the pool)
  - **USDC** buckets 100 / 1,000 / 10,000 / 100,000 USDC (mainnet `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` on Ethereum)
  - **USDT** buckets 100 / 1,000 / 10,000 / 100,000 USDT (mainnet `0xdAC17F958D2ee523a2206206994597C13D831ec7` on Ethereum)
  - **USD1** buckets 100 / 1,000 / 10,000 / 100,000 USD1 — only if it has real volume on mainnet by deploy time
  - DEFERRED for v1.0: DAI, FRAX, PYUSD, governance tokens (WLFI/LDO/etc.).
    Add in v1.1 if user demand emerges. Every additional token = one more
    array of buckets in the constructor; not a contract change, just a
    different deploy.
- [ ] **`zkVerifier`** = `address(0)` for CyrusTresor1 v1; real verifier
  for v2.

## Section D — Operational preconditions

- [ ] **Deployer wallet funded** with enough native gas on each target
  chain. Mainnet deploys cost more: ~3.5M gas × current mainnet gwei.
  At 30 gwei on Ethereum mainnet = ~0.1 ETH (~$300). On Base/Hyperliquid
  much less.
- [ ] **Deployer wallet is SEPARATE from feeCollector multisig.** Reuse
  WALLET1 only if it's been freshly generated for this deploy AND its
  privkey is in a hardware wallet / age-encrypted store, not on disk.
- [ ] **Etherscan v2 API key has mainnet coverage** (the testnet key
  we already have works for mainnet under v2 — just confirm).
- [ ] **Source verification submitted** within minutes of deploy. A
  contract with no verified source on a mainnet block explorer signals
  "scam" to users. Don't skip.
- [ ] **Alchemy / Infura mainnet RPC URL** in deployer's `.env` (not the
  testnet endpoints).
- [ ] **Cloudflare Pages env vars updated** with mainnet contract
  addresses BEFORE the frontend's "mainnet" toggle flips. Use
  `tools/cf-sync-env.sh` (alias `ctg-sync-env`).
- [ ] **Frontend gated** by a feature flag (e.g., `VITE_ENABLE_MAINNET`
  in `.env`). Default off. Flip on only after all above checks pass.

## Section E — Post-deploy verification

Per workflow_rules.md Rule 2: don't declare "live" until real-environment
verification passes. Same matrix as the Sepolia ct-* tests but on mainnet
with REAL funds (small).

- [ ] **ct-1** sanity reads — currentEpoch, EPOCH_LENGTH, bucket sizes — confirm
  expected values.
- [ ] **ct-2** depositETH 0.001 ETH from a fresh wallet (NOT the deployer
  or fee collector) — confirms Bank8 surface works.
- [ ] **ct-3** commitToPool with smallest bucket — get the first PoolDeposit
  event on mainnet.
- [ ] **ct-4 + ct-5** static reverts — same-epoch + MEV-redirect.
- [ ] **ct-7** reveal after epoch boundary — confirms the round-trip.
- [ ] **ct-6** double-spend revert.
- [ ] **ct-8** collectFees from feeCollector multisig — confirm revenue
  withdrawal works AND that the multisig signing flow doesn't time out.
- [ ] **Etherscan/explorer source-verified** — link in the dapp UI.
- [ ] **Audit report published** — link in the dapp UI footer.

## Section F — Revenue / accounting preconditions

- [ ] **Tax / accounting setup** for the foundation entity. Crypto-fee
  income needs proper bookkeeping in whichever jurisdiction.
- [ ] **Fee withdrawal cadence decided.** Daily / weekly / monthly
  `collectFees()` calls. Trade-off: more frequent = more gas; less
  frequent = bigger drain ops. Suggested: weekly batches, with an
  on-call override if balance > 1 ETH equivalent.
- [ ] **Cold-storage policy** for the multisig signers. Hardware wallets,
  not browser extensions. No single-point-of-compromise.
- [ ] **Revenue dashboard** (off-chain) tracks: total fees collected,
  fees per chain, fees per operation type. Not required for launch but
  useful from day 1.

## Section G — Communications

- [ ] **Whitepaper / docs / honest privacy claims**. The dapp tells users
  what they ARE getting (epoch-batched, denomination-bucketed, MEV-safe
  reveal) and what they are NOT getting (cryptographic anonymity, defeats
  state-level adversaries). No overclaiming.
- [ ] **Bug bounty program** active before mainnet. Immunefi or
  similar. Minimum payouts: $1K low / $10K medium / $50K high /
  $100K+ critical.
- [ ] **Incident response plan** documented. Who has access to what,
  who calls the lawyer, who pauses (if pause-able) or migrates.
- [ ] **Public commit** to the upgrade roadmap (v1 → multi-round → v2 ZK)
  so users know what privacy tier to expect when.

## Section H — Decision gate

Before any `--network mainnet` invocation:

- [ ] All Section A boxes ticked (legal preconditions)
- [ ] All Section B boxes ticked (contract audit)
- [ ] At least 90% of Section C / D boxes ticked (operational)
- [ ] You have personally re-read the spec AND the audit findings within
  the last 7 days
- [ ] You have slept on the decision for at least one night

The cost of waiting one more week to launch is ~$100-$1000 in lost early
fees. The cost of launching unprepared can be the entire project + your
personal freedom (Tornado precedent). Default to "wait."

---

## Quick-reference: known-good chain configs for future deploys

```typescript
// Mainnet Chainlink feeds (verify at docs.chain.link before use)
const PRICE_FEEDS_MAINNET = {
  ethereum:    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",   // ETH/USD
  base:        "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",   // ETH/USD (Base)
  bsc:         "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",   // BNB/USD
  optimism:    "0x13e3Ee699D1909E989722E753853AE30b17e08c5",   // ETH/USD
  arbitrum:    "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",   // ETH/USD
  // HyperEVM: research at deploy time — Hyperliquid's Chainlink
  // coverage is still developing as of 2026-05.
};
```

Mainnet tokens (Ethereum mainnet examples):
```
USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
USDT: 0xdAC17F958D2ee523a2206206994597C13D831ec7
DAI:  0x6B175474E89094C44Da98b954EedeAC495271d0F
WLFI: 0x… (check current token registry)
```

---

## What "going to mainnet" actually means operationally

1. Tick this whole checklist
2. Run `deploy_contracts4.sh`-equivalent against `--network ethereumMainnet`
3. Run `verify.ts` against the same network
4. Update `cyrusthegreat/.env` with `VITE_CTGTRESOR_ETH_MAINNET_CONTRACT=0x...`
   (no longer `notdeployednow`)
5. Run `ctg-sync-env` to push to Cloudflare
6. Frontend: flip `VITE_ENABLE_MAINNET=true`, commit, push to main
7. Cloudflare auto-deploys
8. cyrusthegreat.dev offers the mainnet pool

There's no "soft launch" — once step 7 lands, anyone on the open internet
can deposit real money. Plan accordingly.
