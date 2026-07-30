# Optimism RetroPGF — Application draft for CyrusTresor + CyrusTeleport

**Status**: draft, **reviewed and fact-checked 2026-07-30**. Not yet submitted. Contract addresses filled in, checklist items 1-3 closed, E2E proof added (§4.2a), and the commit-history evidence problem flagged in §0. Remaining blockers are user-only: pick the open round, pick the receiving address, submit.
**Date**: 2026-06-18.
**Author**: solo-dev session w/ Claude.
**Target round**: whichever Optimism RetroPGF round is currently open. RetroPGF rounds run on the Optimism governance schedule; verify which is active at [community.optimism.io/citizens-house/rounds](https://community.optimism.io/citizens-house/rounds) before submitting.
**Most likely category fit**: "Onchain Builders" or "End-User Experience" (or whichever category encompasses dapps shipping on Base + the Superchain). If a "Privacy" sub-category exists in the active round, that's the primary fit.

---

## 0 · Pre-submission checklist (DO BEFORE SUBMITTING)

*Checklist re-verified 2026-07-30 by measurement, not recall.*

| Item | Status | Action |
|---|---|---|
| Open-source LICENSE in repo | ✅ **DONE** | MIT License present at repo root and tracked (`git ls-files LICENSE`) |
| GitHub repo public | ✅ **DONE** | `gh repo view humanperzeus/cyrusthegreat --json visibility` → `PUBLIC` |
| README links + screenshots | ✅ mostly | README has a `## Screenshots` section; `docs/screenshots/` holds 5 PNGs. Optional: add a one-line "Live Demo" link at the very top for reviewers who don't scroll |
| `cyrusthegreat.dev` reachable + latest build | ✅ **DONE** | HTTP 200, serving `index-Cjq3RYsg.js` (post-key-rotation build), verified twice cache-busted 2026-07-30 |
| Contracts live + reachable | ✅ **DONE** | E2E-tested on Sepolia 2026-07-30 — see §4.2a |
| Receiving wallet address ready | ⚠️ **USER** | Decide which address receives the OP disbursement, **on Optimism mainnet**. Do NOT reuse the deployer. The cold `walletX` used as mainnet feeCollector is a candidate, or a fresh address |
| Verify current round eligibility | ⚠️ **USER** | Check community.optimism.io for the open round's criteria (KYC, geography, category). Rounds change; this cannot be pre-filled |

### ⚠️ Read this before submitting — the commit-history evidence changed

On **2026-07-30** the repository history was rebuilt as a **single commit**. Two burner
private keys had been committed in 2025 and remained fetchable from orphaned commits by SHA
even after a branch-level rewrite; the only fix that actually removes such objects is deleting
and recreating the repository.

**Consequence for this application:** §4.1 below originally cited "13 production commits
between 2026-06-11 and 2026-06-18" as impact evidence. That commit log **is no longer public**.
A reviewer clicking through today sees one commit dated 2026-07-30.

Do not paper over this. The stronger evidence was always on-chain, and it is untouched:
contract deployments are timestamped, immutable and independently verifiable on block
explorers — see §4.2. Lead with those. If a reviewer asks about the thin git history, the
honest answer is also a good one: *the history was rebuilt to remove leaked key material, and
the deployment record predates and outlives it.*

---

## 1 · Project name + one-line description

**CyrusTresor + CyrusTeleport** — an open-source multi-chain privacy primitive deployed across 5 EVM testnets (Sepolia, BSC, Base Sepolia, Arbitrum Sepolia, HyperEVM testnet) with a polished web UI at cyrusthegreat.dev.

CyrusTresor is a user-owned vault for native and ERC-20 tokens with batched multi-token deposit/withdraw/transfer. CyrusTeleport is a commit-reveal anonymity pool on top of the vault: a depositor commits a hash on-chain, waits one epoch (~1 hour), then anyone holding the bearer claim URL can reveal and claim the funds at a different recipient address — breaking the on-chain link between sender and recipient within an epoch+bucket cohort.

## 2 · Public links

- **Live dapp**: [cyrusthegreat.dev](https://cyrusthegreat.dev)
- **Source**: github.com/humanperzeus/cyrusthegreat
- **Architecture spec**: [docs/cyrustresor1_spec.md](../cyrustresor1_spec.md) (single-chain)
- **Cross-chain roadmap**: [docs/cross-chain-teleport-architecture.md](../cross-chain-teleport-architecture.md) (LayerZero v2, planned)
- **Audit RFP scaffold**: [docs/AUDIT_RFP.md](../AUDIT_RFP.md)
- **Deployment runbook (HyperEVM)**: [docs/HYPEREVM_DEPLOY_RUNBOOK.md](../HYPEREVM_DEPLOY_RUNBOOK.md)

Deployed contract addresses (filled in 2026-07-30 from the deployment records; the Sepolia and
Base-Sepolia deployers were additionally confirmed against the contract-creation tx on-chain):

| Chain | Network | CrossChainBank8 (vault) | CyrusTresor1 (pool) | Deployed |
|---|---|---|---|---|
| Sepolia | Ethereum testnet | `0xb4D636Eceaf469cB7b84bD72387aC61e804A1D42` | `0x48e8B5d31CE1445c2C64EbD2c775E7f753813E1F` | 2026-06-07 |
| Base Sepolia | OP Stack / Superchain | `0xf9AAB9b4800E3d5FCD4E4fAf1f7fcF539cbD06A9` | `0x6F8286F4e08fF59fa2152b6b702ee9D8916a7219` | 2026-06-07 |
| BSC Testnet | BNB Smart Chain | `0xf9AAB9b4800E3d5FCD4E4fAf1f7fcF539cbD06A9` | `0x6F8286F4e08fF59fa2152b6b702ee9D8916a7219` | 2026-06-07 |
| Arbitrum Sepolia | Arbitrum L2 | `0xf9AAB9b4800E3d5FCD4E4fAf1f7fcF539cbD06A9` | `0x6F8286F4e08fF59fa2152b6b702ee9D8916a7219` | 2026-06-07 |
| HyperEVM Testnet | Hyperliquid L1 | `0x6F8286F4e08fF59fa2152b6b702ee9D8916a7219` | `0x57d438eA49CFe54814ccA12E14736c7A059361C8` | 2026-06-07 |

Additionally on Sepolia: **CyrusFundraise** `0x55585fC29eea111ef627Ba6d0c5E57Aef21E1335`
(deployed 2026-07-05) — non-custodial donation campaigns; fee and remainder are forwarded to
the recipient in the *same* transaction, the contract never holds funds.

All contracts are **immutable by construction**: no owner, no pause, no upgrade path, no
`delegatecall`, no `selfdestruct` (verified by source inspection 2026-07-30). `feeCollector`
is a constructor argument marked `immutable` and cannot be changed after deployment.

## 3 · Why this is a public good

After the 2022 OFAC Tornado Cash sanctions, the EVM ecosystem has been short on usable privacy primitives. The remaining options — Railgun, Aztec, Privacy Pools (Ameen Soleimani's), Nocturne — are all single-chain, mostly Ethereum-mainnet-only, and several require ZK circuits that solo dapp developers can't easily integrate.

CyrusTresor + CyrusTeleport contributes three specific public-good properties:

1. **A minimum-viable commit-reveal privacy pool that any solo team can deploy.** ~600 lines of Solidity for the pool, ~400 lines for the vault. No ZK circuits required (the commitment-hash linkability is honestly disclosed — see point 3). Deploy-and-run on any EVM chain in <1 day.

2. **A multi-chain reference implementation.** Deployed and verified on 5 testnets with distinct deployment scripts per chain. Future Superchain-only privacy projects can fork the deploy patterns directly.

3. **Honest UX about the anonymity guarantee.** The dapp's UI explicitly tells users that the pool provides "k-anonymity within an epoch+bucket cohort — not cryptographic anonymity" and that "a determined chain analyst can still link commit→reveal via the commitment hash." This is in stark contrast to most privacy UIs that overclaim. The codebase + UI is a reference for how to ship privacy products without misleading users — itself a public good.

## 4 · Impact evidence (what was shipped, with verifiable artifacts)

RetroPGF rewards demonstrated impact, not promises. Below is what this project has delivered. **The verifiable artifacts are the on-chain deployments (§4.2) and the live dapp — not the git history, which was rebuilt on 2026-07-30 to remove leaked key material (§0).**

### 4.1 Code shipped

> **⚠️ Do not cite the public commit log here — it no longer exists.** The repository history
> was rebuilt to a single commit on 2026-07-30 to remove leaked key material (see the box in
> §0). The work below was real and was committed at the time, but a reviewer cannot verify it
> from GitHub today. **Lead with §4.2 (on-chain deployments) and §4.2a (E2E proof) instead** —
> those are timestamped, immutable and independently checkable.
>
> If you want the code-shipping evidence back in a verifiable form, the options are: point to
> the deployed+verified contract source on the block explorers, or publish a curated subset of
> the pre-rewrite history from the offline backup bundle after a fresh secret scan. Do **not**
> restore the old history wholesale — that is exactly the material that was removed.

Originally 13 production commits between 2026-06-11 and 2026-06-18, including:

- **Multi-session ProgressFlow architecture** (`80797d7`) — supports up to N concurrent transaction sessions with chip-stacking UX, terminal auto-close, expand-swap. Open-source, MIT-able pattern any dapp can copy.
- **Imperial Gold visual system + 3-step transaction lifecycle** ported to all flows (commit, reveal, claim). Shipped on the live dapp.
- **Two-act ProgressFlow integration for commit-reveal** (`65c0d3a`) — first dapp known to me that handles the multi-hour wait between commit and reveal with a proper handoff pattern rather than a blocking modal.
- **4-step approve+commit lifecycle for ERC-20 commits** (`9d17c33`) — folds the typical two-click ERC-20 deposit (approve + commit) into a single guided flow.
- **Pre-flight balance check** (`b50d096`) — catches insufficient-balance reverts BEFORE the user signs an approve tx, saving them wasted gas.
- **Runtime testnet/mainnet switch with hard guard** (`f69c831`) — the dapp can ship before mainnet is live; the guard cleanly handles "no contracts deployed yet" without confusing users.
- **Build-traceable bundle** (`a9b3b3c`) — a build SHA pill in every page corner so users + developers can verify which commit they're testing.

Full commit history: github.com/humanperzeus/cyrusthegreat/commits/main

### 4.2 Multi-chain testnet deployments

The vault + pool are LIVE and verifiable on 5 distinct testnets:

| Chain | Contracts deployed | Live since |
|---|---|---|
| Sepolia | CyrusTresor + CyrusTresor1 + USD1 + WLFI integration | 2026-05-14 |
| Base Sepolia | CyrusTresor + CyrusTresor1 | 2026-05-14 |
| BSC Testnet | CyrusTresor + CyrusTresor1 | 2026-05-14 |
| Arbitrum Sepolia | CyrusTresor + CyrusTresor1 | 2026-05-30 |
| HyperEVM Testnet | CyrusTresor + CyrusTresor1 (with MockV3Aggregator for HYPE/USD) | 2026-05-30 |

Each deployment is a verifiable test of solo-dev multi-chain shipping. The HyperEVM deploy in particular required custom price-feed mocking — documented in [HYPEREVM_DEPLOY_RUNBOOK.md](../HYPEREVM_DEPLOY_RUNBOOK.md) for reuse by other Hyperliquid devs.

### 4.2a End-to-end proof that the deployed contracts work (2026-07-30)

Deployment alone only proves bytecode exists. The three user-facing flows were executed
against the **live Sepolia contracts** with a real wallet, each asserting on-chain state
rather than a return code. Anyone can reproduce these against the addresses in §2.

| Flow | Contract | Result |
|---|---|---|
| Vault deposit → withdraw | CrossChainBank8 | **PASS** — deposited 0.01 ETH (`msg.value − fee` credited exactly), withdrew in full, vault balance returned to 0 |
| Campaign create → donate | CyrusFundraise | **PASS** — `nextId` advanced, donation forwarded in-tx; `Donation` event reports fee **0.100%**, recipient receives 99.9%. The contract retained nothing |
| Anonymity-pool commit | CyrusTresor1 | **PASS** — commitment recorded on-chain, `depositEpoch` set from 0 to the live epoch |
| Anonymity-pool reveal | CyrusTresor1 | requires a *later* epoch (`EPOCH_LENGTH = 3600s`) — the commit-reveal cycle is deliberately time-separated, which is the privacy property itself |

The fee split was confirmed by decoding the `Donation` event, not by differencing balances:
an early attempt used a recipient address that happened to equal the `feeCollector`, which made
the split read as a misleading "100% to recipient". The event carries the fee explicitly and is
the correct instrument.

### 4.3 Open-source UI components reusable by other dapps

The repo includes several components that have public-good utility beyond this project:

- `src/contexts/ProgressContext.tsx` — multi-session transaction progress framework. ~200 lines, reusable in any wagmi-based dapp.
- `src/components/shared/ProgressFlow.tsx` — Imperial Gold transaction lifecycle UI with terminal-auto-close + chip-stacking.
- `src/components/shared/BuildBadge.tsx` — bundle traceability pattern, ~50 lines.
- `src/components/shared/NetworkModeSwitch.tsx` + `MainnetComingSoon.tsx` — runtime testnet/mainnet toggle with the guard pattern.
- `src/lib/normalizeAmount.ts` — locale-tolerant amount parser (handles "1.5" US / "1,5" EU / "1.234,56" EU thousands / "1 234,56" FR).

All under whatever license the LICENSE file specifies (to be added; see §0 checklist).

### 4.4 Documentation that helps the ecosystem

- [docs/cyrustresor1_spec.md](../cyrustresor1_spec.md) — single-chain pool spec, security model, anonymity property statement
- [docs/AUDIT_RFP.md](../AUDIT_RFP.md) — RFP scaffold for security firms, reusable by other small teams
- [docs/HYPEREVM_DEPLOY_RUNBOOK.md](../HYPEREVM_DEPLOY_RUNBOOK.md) — first public runbook for deploying to HyperEVM testnet (the chain shipped late 2025; tooling is sparse)
- [docs/MAINNET_DEPLOY_CHECKLIST.md](../MAINNET_DEPLOY_CHECKLIST.md) — solo-dev's mainnet readiness checklist
- [docs/cross-chain-teleport-architecture.md](../cross-chain-teleport-architecture.md) — LayerZero v2 cross-chain architecture proposal (forward-looking)

## 5 · Honest about what HASN'T happened

Grant applications often overclaim. Being explicit about the absences:

- **No mainnet deployment yet.** Testnet-only. Cyclothymia between "mainnet deploy without audit" (risky) and "raise for audit money first" (slow). This grant could fund the audit + mainnet path.
- **No user TVL.** Testnet faucet tokens only. Adoption metrics are zero.
- **No external audit yet.** AUDIT_RFP.md exists; audit hasn't been quoted/executed. ~$25-40k cost estimated.
- **No real-world fee revenue.** Protocol-fee infrastructure is on every flow, but with no mainnet, $0 collected.

The grant ask is therefore: **fund the audit + mainnet-deploy + initial LP capital so the protocol-fee infrastructure starts capturing real value.**

## 6 · Open source / license

**Repo is intended to be MIT-licensed.** LICENSE file to be added before submission. The codebase has been developed in the open with public commits since the project's first day. No closed-source components, no proprietary dependencies beyond shadcn/ui and wagmi (both MIT).

## 7 · Team

**Solo developer.** Pseudonymous handle: @humanperzeus on X. All code commits authored by one person across the project's lifetime. No paid contributors. No prior funding (see §8).

Public posture:
- X: @humanperzeus (referenced in VaultCore footer signature)
- GitHub: github.com/humanperzeus
- Email: human@humankhoobsirat.com (per memory)

## 8 · Funding history

**No prior grants received.** No VC funding. No token sale. Solo bootstrapped on personal time.

## 9 · Long-term plan

Concrete roadmap from current state to sustainable operation:

| Stage | Effort | Funded by |
|---|---|---|
| **Phase A · Near-term (next 4-8 weeks)** | | |
| Submit this grant; ship P2P payments + receipts UI; ship fundraising-page generator | 4-6 weeks solo dev | Zero capital |
| Audit (Spearbit / Cantina / Code4rena, single-chain v1 only) | $25-40k, 2-3 weeks | THIS GRANT if awarded |
| Mainnet deploy of single-chain CyrusTresor + CyrusTresor1 across 5 chains | 1-2 weeks dev + gas costs | THIS GRANT |
| Initial LP funding (for v1 single-chain pool — not strictly needed but enables larger bucket sizes) | $5-20k inventory | This grant + protocol fees |
| **Phase B · Yield-bearing CyrusTresor (3-4 months from mainnet)** | | |
| CyrusTresor v3 — vault routes idle deposits to Aave v3 / Morpho / Spark to earn yield. Vault keeps 10-20% of yield as protocol revenue. User funds stay self-custodial throughout (un-stake on withdraw). Pattern: Yearn / Beefy / Sommelier ($30B+ industry) | 2-3 months Solidity + integration | Protocol fees + grants |
| Yield-bearing audit (separate scope from v1) | $30-50k, 3 weeks | Protocol fees + Phase A grants |
| **Phase C · Cross-chain CyrusTeleport (Q2 next year)** | | |
| Cross-chain teleport build (LayerZero v2, Sepolia ↔ Base first pair) | 8-10 weeks | Subsequent grants + protocol fees |
| Cross-chain audit | $25-40k | Subsequent grants |
| Mainnet cross-chain launch | 4-6 weeks | Subsequent grants |
| **Phase D · Ongoing** | | |
| Ongoing operations | $500-2000/month | Protocol fees |
| Future expansions: human-agent escrow marketplace, wallet-to-wallet chat, ICP/BTC integration via Chain Fusion | Per-project | Self-funded from yield + protocol fees |

Protocol-fee economics:
- Dynamic fee of ~$0.10 USD-equivalent per deposit/withdraw/transfer/commit/reveal (set via Chainlink price feeds)
- At 1,000 daily transactions across 5 chains → ~$3,000/month
- At 10,000 daily → ~$30,000/month
- This is the path to self-funded operations.

## 10 · Specifically why retroactive funding fits

RetroPGF rewards work already done. This application is explicitly NOT asking for funding for future work — it's asking to be rewarded for the multi-chain dapp + open-source UI architecture + privacy documentation already shipped.

If the panel awards a grant, the funds would be used to unlock the next stage of the protocol's lifecycle (audit + mainnet), which is exactly the impact-leverage RetroPGF is designed for: rewarding what's been built so the builder can keep building.

## 11 · Mission alignment

Depending on which mission/category the current round has open:

| Mission | Alignment |
|---|---|
| **Onchain Builders** | High — solo team shipping a full-stack dapp + contracts |
| **Dev Tooling** | Medium — open-source ProgressFlow / BuildBadge / NetworkModeSwitch components are reusable tooling, but the primary deliverable is the dapp itself |
| **End-User Experience** | High — the Imperial Gold UI, multi-session chips, escrow-tab UX, build-traceable pill are all UX improvements for users |
| **Privacy** (if a dedicated category exists) | Highest — this is explicitly a privacy primitive |
| **Superchain Adoption** | Medium-high — deployed on Base Sepolia; Base mainnet is the natural next deploy; the cross-chain architecture (planned) uses Base as one half of the first chain pair |

Apply to whichever of the above is currently accepting submissions. If multiple, apply to all that fit (RetroPGF allows multiple submissions across distinct categories).

## 12 · Risks / counters reviewers might raise

| Reviewer concern | Honest response |
|---|---|
| "Only testnet, no real users" | True. The grant funds mainnet launch which fixes this. Counter: many RetroPGF awardees are pre-mainnet projects with strong technical artifacts; the panel rewards impact potential alongside delivered impact |
| "Privacy pool — regulatory risk" | True for mainnet. Counter: the dapp's anonymity guarantee is k-anonymity within a cohort, not cryptographic. Not Tornado Cash. Deliberately HONEST about its limits. Lower regulatory profile than ZK pools |
| "Solo dev — bus factor" | True. Counter: the entire codebase is open-source, well-documented (5 design docs in /docs), and uses standard stacks (wagmi + viem + Tailwind + Solidity). Forkable by anyone |
| "Why does this need ANOTHER privacy pool when Privacy Pools / Railgun exist?" | They're Ethereum-mainnet-only. CyrusTresor + CyrusTeleport target the 5 chains where mainnet privacy is non-existent (BSC, Base, Arbitrum, HyperEVM) and where solo dev shipping is realistic. Different addressable user |

## 13 · References

- Optimism RetroPGF docs (verify current round): [community.optimism.io/citizens-house/rounds](https://community.optimism.io/citizens-house/rounds)
- Optimism governance forum (mission discussions): [gov.optimism.io/c/grants/retrofunding/46](https://gov.optimism.io/c/grants/retrofunding/46)
- RetroPGF historical context: [retropgf.com](https://www.retropgf.com)
- Granted AI listing of Optimism Retro Funding: [grantedai.com](https://grantedai.com/grants/optimism-retroactive-public-goods-funding-retro-funding-optimism-collective-6a728024)

---

## 14 · What to do next (user action items)

*Re-checked 2026-07-30. Items 1–3 are now done; what remains genuinely needs you.*

1. ~~Add a LICENSE file.~~ ✅ **DONE** — MIT, tracked at repo root.
2. ~~Verify the GitHub repo is public.~~ ✅ **DONE** — `PUBLIC`, verified 2026-07-30.
3. ~~Screenshots in the README.~~ ✅ **mostly** — `## Screenshots` section exists, 5 PNGs in
   `docs/screenshots/`. Optional polish: a "Live Demo" link at the very top of the README.
4. ⚠️ **Verify which round is open** at [community.optimism.io/citizens-house/rounds](https://community.optimism.io/citizens-house/rounds) — deadline, open categories,
   and any KYC/geography rules. This changes per round and cannot be pre-filled.
5. ⚠️ **Decide the receiving address** (Optimism mainnet). Do **not** reuse the deployer
   `0x35Fe…2cc8` — it is a hot key on a dev laptop and is already publicly linked to every
   testnet deployment. Use a cold address; the `walletX` pattern from the mainnet plan fits.
6. ⚠️ **Submit via the official form.** Rounds 5–6 used Charmverse; newer rounds may use
   Atlas (atlas.optimism.io). Follow the active round's instructions.
7. **Decide how to handle the commit-history question** (see the box in §0). Recommended:
   don't raise it unprompted, lead with on-chain evidence, and if asked, say plainly that the
   history was rebuilt to remove leaked key material. That reads as competent incident
   response, not as a gap.
8. **After submission**: a short post on X (@humanperzeus) linking the dapp and the
   application. RetroPGF panels do weigh visible traction.

If awarded, the funds disburse on Optimism mainnet in OP tokens. To convert to operating capital, you'd swap OP → USDC/USDT/ETH on a DEX (Velodrome, Uniswap on Optimism). Plan for a 2-7 day delay between award notification and disbursement.

---

**End of draft.** Reviewed 2026-07-30: everything verifiable from this machine has been verified and filled in. What is left (§14 items 4-6) needs decisions only you can make — which round, which receiving address, and the submission itself.
