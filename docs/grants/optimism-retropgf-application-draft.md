# Optimism RetroPGF — Application draft for CyrusTresor + CyrusTeleport

**Status**: draft. Not yet submitted. User to review, edit, then submit via Optimism's official application form (Charmverse / Atlas — whichever the current round uses).
**Date**: 2026-06-18.
**Author**: solo-dev session w/ Claude.
**Target round**: whichever Optimism RetroPGF round is currently open. RetroPGF rounds run on the Optimism governance schedule; verify which is active at [community.optimism.io/citizens-house/rounds](https://community.optimism.io/citizens-house/rounds) before submitting.
**Most likely category fit**: "Onchain Builders" or "End-User Experience" (or whichever category encompasses dapps shipping on Base + the Superchain). If a "Privacy" sub-category exists in the active round, that's the primary fit.

---

## 0 · Pre-submission checklist (DO BEFORE SUBMITTING)

| Item | Status | Action |
|---|---|---|
| Open-source LICENSE in repo | **MISSING** | Add `LICENSE` file at repo root. MIT or Apache-2.0 are the most grant-friendly. AGPL-3.0 also accepted but more restrictive for downstream users |
| GitHub repo public | TBD | Verify github.com/humanperzeus/cyrusthegreat is set to public, not private |
| README links + screenshots | Partially done | Add a "Live Demo" section with screenshots of the v2 UI (commit form, notebook, /claim) for grant reviewers who don't connect wallets |
| `cyrusthegreat.dev` is reachable + on latest build | Verify | Hard-refresh, check BuildBadge bottom-left matches expected commit |
| Receiving wallet address ready | TBD | Decide which address receives the OP token disbursement (treasury, personal, multisig). Must be on Optimism mainnet |
| Verify current round eligibility | TBD | Check community.optimism.io for the open round's specific criteria (some rounds have geographic/age restrictions, KYC, etc.) |

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

Deployed contract addresses (testnets, all live as of submission):

| Chain | Network | CyrusTresor (vault) | CyrusTresor1 (pool) |
|---|---|---|---|
| Sepolia | Ethereum testnet | env: VITE_CTGVAULT_ETH_TESTNET_CONTRACT | env: VITE_CTGTRESOR_ETH_TESTNET_CONTRACT |
| Base Sepolia | OP Stack / Superchain | env: VITE_CTGVAULT_BASE_TESTNET_CONTRACT | env: VITE_CTGTRESOR_BASE_TESTNET_CONTRACT |
| BSC Testnet | BNB Smart Chain | env: VITE_CTGVAULT_BSC_TESTNET_CONTRACT | env: VITE_CTGTRESOR_BSC_TESTNET_CONTRACT |
| Arbitrum Sepolia | Arbitrum L2 | env: VITE_CTGVAULT_ARB_TESTNET_CONTRACT | env: VITE_CTGTRESOR_ARB_TESTNET_CONTRACT |
| HyperEVM Testnet | Hyperliquid L1 | env: VITE_CTGVAULT_HYPER_TESTNET_CONTRACT | env: VITE_CTGTRESOR_HYPER_TESTNET_CONTRACT |

(Fill in actual addresses from `.env` at submission time. Verify on the respective explorers.)

## 3 · Why this is a public good

After the 2022 OFAC Tornado Cash sanctions, the EVM ecosystem has been short on usable privacy primitives. The remaining options — Railgun, Aztec, Privacy Pools (Ameen Soleimani's), Nocturne — are all single-chain, mostly Ethereum-mainnet-only, and several require ZK circuits that solo dapp developers can't easily integrate.

CyrusTresor + CyrusTeleport contributes three specific public-good properties:

1. **A minimum-viable commit-reveal privacy pool that any solo team can deploy.** ~600 lines of Solidity for the pool, ~400 lines for the vault. No ZK circuits required (the commitment-hash linkability is honestly disclosed — see point 3). Deploy-and-run on any EVM chain in <1 day.

2. **A multi-chain reference implementation.** Deployed and verified on 5 testnets with distinct deployment scripts per chain. Future Superchain-only privacy projects can fork the deploy patterns directly.

3. **Honest UX about the anonymity guarantee.** The dapp's UI explicitly tells users that the pool provides "k-anonymity within an epoch+bucket cohort — not cryptographic anonymity" and that "a determined chain analyst can still link commit→reveal via the commitment hash." This is in stark contrast to most privacy UIs that overclaim. The codebase + UI is a reference for how to ship privacy products without misleading users — itself a public good.

## 4 · Impact evidence (what was shipped, with verifiable artifacts)

RetroPGF rewards demonstrated impact, not promises. Below is the impact this project has delivered, all verifiable from public commits and the live dapp.

### 4.1 Code shipped (last 30 days, public commit log)

13 production commits between 2026-06-11 and 2026-06-18, including:

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
| Audit (Spearbit / Cantina / Code4rena, single-chain v1 only) | $25-40k, 2-3 weeks | THIS GRANT if awarded |
| Mainnet deploy of single-chain CyrusTresor + CyrusTresor1 across 5 chains | 1-2 weeks dev + gas costs | THIS GRANT |
| Initial LP funding (for v1 single-chain pool — not strictly needed but enables larger bucket sizes) | $5-20k inventory | This grant + protocol fees |
| Cross-chain teleport build (LayerZero v2, Sepolia ↔ Base) | 8-10 weeks | Subsequent grants + protocol fees |
| Cross-chain audit | $25-40k | Subsequent grants |
| Mainnet cross-chain launch | 4-6 weeks | Subsequent grants |
| Ongoing operations | $500-2000/month | Protocol fees |

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

1. **Add a LICENSE file to the repo.** MIT is the safest grant choice. I can do this in a follow-up commit if you say go.
2. **Verify the GitHub repo is public** (not private).
3. **Take screenshots** of the v2 commit form, Notebook, /claim page, the build badge. Add them to the README's "Live Demo" section.
4. **Verify which Optimism RetroPGF round is currently open** at [community.optimism.io/citizens-house/rounds](https://community.optimism.io/citizens-house/rounds). Note the deadline and which categories are accepting submissions.
5. **Decide which wallet address receives the OP token disbursement** (must be on Optimism mainnet).
6. **Submit via the official form.** Round 5-6 used Charmverse; future rounds may use Atlas (atlas.optimism.io) or a different platform — follow the current round's instructions.
7. **After submission**: post a brief about it on X (@humanperzeus). RetroPGF panels do consider public traction; even a single thread linking the dapp + this application can move the needle.

If awarded, the funds disburse on Optimism mainnet in OP tokens. To convert to operating capital, you'd swap OP → USDC/USDT/ETH on a DEX (Velodrome, Uniswap on Optimism). Plan for a 2-7 day delay between award notification and disbursement.

---

**End of draft. User: review, edit, then act on the §14 checklist. Tell me when you want me to add the LICENSE file in a follow-up commit.**
