# cyrusthegreat Brain

**Project:** Anonymous multi-chain Web3 vault — deposit, withdraw, internal-transfer ETH and ERC-20s with privacy via cryptographic obfuscation (keccak256 over user/token/salt). Multi-chain by parallel deployments (no bridge / no LayerZero), with Solana planned. Dynamic ~$0.10 USD fee via Chainlink price feeds.
**Stack:** Vite + React 18 + TypeScript, Tailwind + shadcn/ui, Wagmi + Viem + Reown AppKit. Solidity ^0.8.20 + OpenZeppelin (EVM). Anchor (Solana, written, not integrated).
**Repo:** `/Users/humank/Downloads/DEVELOPMENT/CYRUS/cyrusthegreat`
**Live URL:** https://cyrusthegreat.dev (Cloudflare Pages)
**Last updated:** 2026-05-17

## Where we stand (as of 2026-05-17, verified — not from memory)

- **Live in production at cyrusthegreat.dev** (verified end-to-end 2026-05-09; unchanged 2026-05-17):
  - Frontend bundle: `/assets/index-DG1Do22v.js` (latest), 958 KB
  - **Talks to CrossChainBank8** at:
    - Sepolia: `0xb83A814097C70dB79568b663662eA07e77D4D87a`  ← live deposit tx confirmed by user 2026-05-09
    - BSC Testnet: `0xFb0EB1FE0b61D93C3b56a811702aAE494A8f3582`
    - Base Sepolia: `0x2F2963FF1F68E4Bb283C34193396eF84eaC2ca5B`
  - Bank5 (`0x3d6e43...B4`) no longer referenced in live bundle.
  - Source on `origin/main` is `be8d247 chore(deps): refresh package-lock.json` (on top of `d131daf v.1.17.64`). History was rewritten on 2026-05-09 to remove a temporary security incident from public commit log.
  - Deploy mechanism: Cloudflare Pages auto-deploy on push to main. Env vars in dashboard. `tools/cf-sync-env.sh` (alias `ctg-sync-env`) syncs `.env` → Cloudflare in one command.
  - All Alchemy / Ankr / Etherscan API keys rotated 2026-05-09 after security incident; new keys verified working via debug-UI API health check.
  - **Still no mainnet deployment on any chain.** All `_MAINNET_CONTRACT` slots are `notdeployednow`.
- **Local `main` branch:**
  - 80 commits ahead / 61 behind `origin/main` (last rebase reference: `5eb421d v1.17.4`). Heavy divergence from the rewritten origin/main; **do NOT push** until divergence is sorted. Today's 2 new commits (`d7f1f10`, `bc6fac1`) sit on top of the unpushed Portal-experimentation stack.
  - Uncommitted in working tree (out-of-scope for current session): Portal fee-model edits (`contracts/evm/CyrusPortal11.sol`, `src/components/portal/PortalInterface.tsx`, `src/contracts/abis/CyrusPortal11.json`), plus minor edits to BRAIN.md / TODO.md / `.env.production` deletion.
  - Already promoted: **CrossChainBank8** is what cyrusthegreat.dev serves (see "Live" section above). Local main does NOT need a separate "promote Bank8" step — that landed via the 2026-05-09 origin rewrite.
- **Other branches:** `backup` is **HISTORICAL only** (was live-matching pre-Portal, before the Bank8 promotion). Do not use as live reference. `solana-reown-integration` (status unknown, not investigated).
- **Active priorities:** see [TODO.md](TODO.md)

## Recent context (this session, 2026-05-13)

- **Bank8 fully verified 12/12 on Sepolia** via the debug UI (Tests b8-1 → b8-12). Closes the 2026-05-09 open thread "untested Bank8 functions" — `depositToken`, `withdrawToken`, `transferInternalToken`, `transferMultipleTokensInternal`, `collectFees` all confirmed working on real Sepolia transactions. Wallet 1 (`0x8406…691E`) and Wallet 2 (`0xa5f8…892E`) used as sender/recipient.
- **Debug UI moved into the repo** at `cyrusthegreat/tools/contract-debug/` (was previously outside any git repo at `../tools/contract-debug/`). Now versioned alongside the contracts it tests.
- **Debug UI capability additions** (committed today):
  - **FallbackProvider read path** — `getReadProvider()` returns an `ethers.FallbackProvider` with quorum 1 across 3-5 public RPCs per chain. Auto-rotates when any single URL rate-limits (Brave Shields, public-RPC throttling).
  - **Probe-on-connect** — `probeReadRpc()` pings each candidate RPC's `eth_chainId` and picks the first that works; logs each probe; shows the chosen URL in a header pill.
  - **Wallet RPC diagnostic** — 🔧 button fires 9 JSON-RPC methods directly at `window.ethereum.request()` and renders pass/fail. Isolates wallet-backend failures from dapp code.
  - **Nested error walker (`formatErr`)** — surfaces the real cause of ethers v6's opaque "could not coalesce error" by walking `.cause` / `.error` / `.info` chains.
  - **Optional Alchemy URL** — paste into the existing API health-check input and it's prepended to the candidate RPC list + persisted to localStorage. Not required (public fallbacks work).
- **L-010 added to `tech_learnings.md`**: wallet RPC health is a write-path-only failure mode — reads can be insulated with dapp-controlled providers, writes can't. Categorically important pattern; sidesteps weeks of future debugging when a user's wallet RPC goes down on testnet.

## Prior context (still relevant from 2026-05-08 / 2026-05-09)

- **Folder disambiguation**: `CYRUS/ctg_1` (hardhat-deploy pipeline) and `CYRUS/ctg_2` (Bank5 debug UI) renamed and archived into `CYRUS/tools/`. `ctg_1/{frontend,backend,supabase}` confirmed dead-ends. `contracts_quantum/` archived (PQC + TEE + mix-net experiment, Aug 2025). 3 zip backups archived (`vaultwhisper`-era snapshots).
- **CTGANDRAILGUN/** (35 GB, Sept 16 2025 — newer than this repo's last commit at that time) flagged as a RailGun-fork study folder. **Not yet investigated.**
- **Security incident handling (2026-05-09)**: `.env.production` and Sept 2025 `9674fa8` commit had leaked API keys + privkeys. `git filter-repo --replace-text` scrubbed all 8 secrets from all branches; force-pushed clean history. API keys rotated. Wallet privkeys treated as forever-Sepolia-only burner wallets (per L-008, never use on mainnet).

## Contract lineage status (verified by source-reading 2026-05-08)

| Version | Source location | Deployment | Verdict |
|---|---|---|---|
| **Bank4** | `tools/hardhat-deploy/contracts/CrossChainBank4.sol` (144 lines) | unknown | Baseline; works. |
| **Bank5** | not in repo (live deployment is the only artifact) | `0x3d6e43cbf157110015edF062173BbeBF78De61B4` Sepolia — production at cyrusthegreat.dev | Live. |
| **Bank6** (quantum) | `_archive/contracts_quantum-pqc-tee-experiment-aug14/CrossChainBank6.sol` (356 lines) | none | **Won't compile.** TEE validator interface undefined; vault key generation broken (`vault[_key(address(this), token)]` instead of `vault[_key(user, token)]`). Aug-14 abandonment was correct. |
| **Bank8** | `contracts/evm/CrossChainBank8.sol` (611 lines) | Sepolia `0xb83A814097C70dB79568b663662eA07e77D4D87a` · BSC Testnet `0xFb0EB1FE0b61D93C3b56a811702aAE494A8f3582` · Base Sepolia `0x2F2963FF1F68E4Bb283C34193396eF84eaC2ca5B` | **LIVE on cyrusthegreat.dev (since 2026-05-09).** **12/12 functions verified end-to-end on Sepolia 2026-05-13** via `tools/contract-debug/` (Tests b8-1 → b8-12, two-wallet flows including transfers). Covers: read-fee constants, single ETH deposit/withdraw/transfer, multi-token batch deposit (ETH+USD1+WLFI), multi-token batch withdraw, internal transfers (single + batch), `depositToken`/`withdrawToken`/`transferInternalToken`/`transferMultipleTokensInternal`/`collectFees`. **Bank5's "missing revert data" multi-token bug confirmed FIXED.** BSC Testnet + Base Sepolia deployments still not individually smoke-tested (only Sepolia is verified; share code paths with Sepolia, low risk). |
| **Bank9** | **source missing from this repo** | unknown — referenced by `tests_evm/testing-contract/test-crosschainbank9.cjs` etc. | **MYSTERY.** Tests call `vault.registered()`, `vault.registerWithWLFI()`, `vault.mixUSD1()` — none of these exist in Bank8. So Bank9 is a real separate deployment with WLFI gating + USD1 mixing. Source either lives in another folder we haven't inspected or was deleted before commit. |
| **Portal11** | `contracts/evm/CyrusPortal11.sol` (1042 lines) | none | **Half-baked.** Compiles. Privacy primitives sketched. **4 known bugs** (see TODO.md): fee not charged on reveal, ETH price updates never trigger, `_clearPrivacyStorage()` wipes all users' data, "MEV protection" is just 2-block delay. Uncommitted edits in working tree are fixing one (the fee path). Identical copy lives at `CTGANDRAILGUN/byteleport/contracts/CP11/` — older snapshot, not a fork. **Superseded by CyrusTresor1** (see below); Portal11 unlikely to be deployed. |
| **CyrusTresor1** | `contracts/evm/CyrusTresor1.sol` (~830 lines) | Sepolia `0x223E25F961E29AaCc3dB49e5b00B30452D42c65e` · BSC Testnet `0xa2D2A04d6eE5887f20bF736E1d9014727d599F39` · Base Sepolia `0xc90610ce4DE152349932Af102650b6c9f8C6AD68` | **VERIFIED END-TO-END on Sepolia 2026-05-17**: 27/27 Foundry unit tests + 7/7 debug-UI on-chain ct-cards (commit `0xf181d72a` / reveal `0x79e50e37`, same commitment `0x14aee5b0…`) + source verified on Etherscan. BSC Testnet + Base Sepolia: deployed + source-verified but not yet debug-UI tested (byte-identical bytecode, low risk). **NOT YET LIVE on cyrusthegreat.dev** — frontend code does not reference VITE_CTGTRESOR_* slots yet (Session F+ pending). Pool layer: 1h epochs, fixed-bucket commit/reveal, withdrawTo baked into commitment for MEV-safety, commit-only fees (free reveal). Spec: `docs/cyrustresor1_spec.md`. Bank8 regular-vault surface preserved byte-for-byte (opt-in pool, not replacement). |

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
4. Production status diverges from local. Always cross-check: which contract does cyrusthegreat.dev's *deployed bundle* call? (Currently **Bank8** `0xb83A814097C70dB79568b663662eA07e77D4D87a` on Sepolia, since 2026-05-09 promotion.) Don't conflate with what the local `main` branch's `.env` says. Re-verify with the curl-the-bundle check from `workflow_rules.md` Rule 2.
5. The `backup` branch is **HISTORICAL only** — it was live-matching pre-Portal, *before* the Bank8 promotion on 2026-05-09. Do **not** use as a "what's live now?" reference. For that, curl the live bundle (see Rule 2 of workflow_rules.md).
6. **Wallet RPC ≠ dapp RPC** (per L-010, 2026-05-13). When a wallet's RPC backend goes down, reads can be rescued via dapp-controlled providers, but writes are stuck. Diagnose with the debug UI's 🔧 Diagnose-wallet button before assuming dapp code is broken.
