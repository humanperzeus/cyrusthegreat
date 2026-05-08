# cyrusthegreat Brain

**Project:** Anonymous multi-chain Web3 vault — deposit, withdraw, internal-transfer ETH and ERC-20s with privacy via cryptographic obfuscation (keccak256 over user/token/salt). Multi-chain by parallel deployments (no bridge / no LayerZero), with Solana planned. Dynamic ~$0.10 USD fee via Chainlink price feeds.
**Stack:** Vite + React 18 + TypeScript, Tailwind + shadcn/ui, Wagmi + Viem + Reown AppKit. Solidity ^0.8.20 + OpenZeppelin (EVM). Anchor (Solana, written, not integrated).
**Repo:** `/Users/humank/Downloads/DEVELOPMENT/CYRUS/cyrusthegreat`
**Live URL:** https://cyrusthegreat.dev (Cloudflare Pages)
**Last updated:** 2026-05-08

## Where we stand (as of 2026-05-08, verified — not from memory)

- **Live in production at cyrusthegreat.dev:**
  - Frontend bundle: `/assets/index-wFiv6NE4.js` (verified by curl, contains contract address)
  - Talks to **CrossChainBank5** at `0x3d6e43cbf157110015edF062173BbeBF78De61B4` on **Sepolia testnet only**
  - Source matches the `backup` branch at `cc2d992 v1.17.55: Complete deposit modal validation and UX consistency`
  - **No mainnet deployment on any chain.** All `_MAINNET_CONTRACT` slots in `.env` are `notdeployednow`.
- **Local `main` branch:**
  - 16 commits ahead of `origin/main`. None are tagged with semver-style messages — all "pre v9/v10 - N" experimental labels
  - 3 files uncommitted (Portal fee-model rewrite in progress): `contracts/evm/CyrusPortal11.sol`, `src/components/portal/PortalInterface.tsx`, `src/contracts/abis/CyrusPortal11.json` (+455/-40 lines)
  - Targets newer **CrossChainBank8** at `0xb83A814097C70DB79568b663662eA07e77D4D87a` (Sepolia testnet) — deployed but **not promoted to production frontend**
- **Other branches:** `backup` (= live snapshot, last pre-Portal release), `solana-reown-integration` (status unknown, not investigated this session)
- **Active priorities:** see [TODO.md](TODO.md)

## Recent context (this session, 2026-05-08)

- Disambiguated `CYRUS/ctg_1` and `CYRUS/ctg_2` (sister folders that confused the dev). Result:
  - `ctg_2` was a v0.dev-generated debug UI hardcoded against Bank5 — **the same contract that's live at cyrusthegreat.dev right now.** Renamed to `CYRUS/tools/bank5-debug-ui/`. Useful for poking the production contract function-by-function.
  - `ctg_1/hardhat` was the only compile/deploy pipeline. cyrusthegreat absorbed *runtime testing* into `tests_evm/` but **NOT** compile/deploy. Renamed to `CYRUS/tools/hardhat-deploy/`. Needs path-fixing in `deploy_contracts4.sh` before reuse.
  - `ctg_1/{frontend,backend,supabase}` archived as confirmed dead-ends.
  - `contracts_quantum/` archived (PQC + TEE + mix-net experiment, Aug 2025, abandoned).
  - 3 zip backups archived (`vaultwhisper`-era snapshots, before project was renamed).
- `CTGANDRAILGUN/` (35 GB, dated Sept 16 2025 — newer than this repo's last commit) flagged as a RailGun-fork study folder. **Not yet investigated.** Probably contains the most recent thinking.

## Contract lineage status (verified by source-reading 2026-05-08)

| Version | Source location | Deployment | Verdict |
|---|---|---|---|
| **Bank4** | `tools/hardhat-deploy/contracts/CrossChainBank4.sol` (144 lines) | unknown | Baseline; works. |
| **Bank5** | not in repo (live deployment is the only artifact) | `0x3d6e43cbf157110015edF062173BbeBF78De61B4` Sepolia — production at cyrusthegreat.dev | Live. |
| **Bank6** (quantum) | `_archive/contracts_quantum-pqc-tee-experiment-aug14/CrossChainBank6.sol` (356 lines) | none | **Won't compile.** TEE validator interface undefined; vault key generation broken (`vault[_key(address(this), token)]` instead of `vault[_key(user, token)]`). Aug-14 abandonment was correct. |
| **Bank8** | `contracts/evm/CrossChainBank8.sol` (611 lines) | `0xb83A814097C70DB79568b663662eA07e77D4D87a` Sepolia | **Deployed and VERIFIED on Sepolia 2026-05-08** via `tools/contract-debug/`. All 7 functions exercised live: single ETH deposit/withdraw/transfer, multi-token batch deposit (ETH+USD1+WLFI), multi-token batch withdraw, internal transfer. **Bank5's "missing revert data" multi-token bug confirmed FIXED.** Not yet promoted to cyrusthegreat.dev — see TODO.md. BSC Testnet + Base Sepolia deployments not yet smoke-tested (only Sepolia is verified). |
| **Bank9** | **source missing from this repo** | unknown — referenced by `tests_evm/testing-contract/test-crosschainbank9.cjs` etc. | **MYSTERY.** Tests call `vault.registered()`, `vault.registerWithWLFI()`, `vault.mixUSD1()` — none of these exist in Bank8. So Bank9 is a real separate deployment with WLFI gating + USD1 mixing. Source either lives in another folder we haven't inspected or was deleted before commit. |
| **Portal11** | `contracts/evm/CyrusPortal11.sol` (1042 lines) | none | **Half-baked.** Compiles. Privacy primitives sketched. **4 known bugs** (see TODO.md): fee not charged on reveal, ETH price updates never trigger, `_clearPrivacyStorage()` wipes all users' data, "MEV protection" is just 2-block delay. Uncommitted edits in working tree are fixing one (the fee path). Identical copy lives at `CTGANDRAILGUN/byteleport/contracts/CP11/` — older snapshot, not a fork. |

## Architectural decisions (ADRs)

- **ADR-001: Cryptographic obfuscation, not ZK.** Balances stored under `keccak256(user, token, SALT)`. **Why:** cheaper gas and simpler audit surface than ZK proofs. **Trade-off:** privacy-by-obscurity vs mathematical guarantee. **Date:** ~2025-08.
- **ADR-002: Single mega-hook architecture.** All vault state lives in `src/hooks/useVault.ts` (~2263 lines as of v.1.17.66). Components are presentation-only. **Why:** centralized state, easier to refactor than scattered hooks. **Trade-off:** large file, prop-drilling. **Date:** ~2025-08.
- **ADR-003: Wagmi + custom transaction management (dual layer).** Wagmi handles transaction lifecycle (pending → confirming → confirmed); custom code adds chain-specific finality delays before refreshing balances (ETH 12s, BSC 8s, BASE 2s). **Why:** prevents race conditions on fast chains where Wagmi's "confirmed" fires before the chain has actually finalized. **Date:** v.1.17.61 (2025-09).
- **ADR-004: Provider-independence naming.** All Wagmi-based functions suffixed `Wagmi`; custom equivalents kept as fallbacks. **Why:** swap providers later (Ethers / Web3-React / Thirdweb) without renaming everything. **Date:** v.1.17.62 (2025-09).
- **ADR-005: Vite over Next.js.** Migrated from earlier Next.js scaffolds (ctg_1 frontend, ctg_2). **Why:** fully client-side dapp; SSR has no value for wallet-gated UI; Vite is faster, lighter, deploys to Cloudflare Pages cleanly. **Date:** 2025-08-13.
- **ADR-006: No backend, no DB.** ctg_1's Express + Supabase token-cache idea was dropped. Live Etherscan / RPC discovery instead. **Why:** zero infra to operate; no scam-score DB to maintain. **Trade-off:** lost the anti-scam token directory feature. **Date:** 2025-08-13.

## Anti-hallucination rules (read at session start)

1. This file is the source of truth for current state. Verify against `git log`, `.env`, and the deployed bundle if anything looks off.
2. Never cite version numbers / contract addresses / URLs / file paths from training-data assumptions. Verify against `package.json`, `.env`, and live curl. The CURRENT_STATUS.md in this repo is dated December 2024 and is **stale** — do not trust its claims without re-verifying.
3. "Working" requires evidence: a passing test, a transaction hash, a screenshot, a `curl` response. "Should work" / "I think it does" / "the docs say so" is **not** evidence.
4. Production status diverges from local. Always cross-check: which contract does cyrusthegreat.dev's *deployed bundle* call? (Currently Bank5 `0x3d6e43...B4`.) Don't conflate with what the local `main` branch's `.env` says.
5. The `backup` branch ≈ what's live. Use it for "what does the live site look like?" comparisons. Do not assume `main` matches live — it currently does not.
