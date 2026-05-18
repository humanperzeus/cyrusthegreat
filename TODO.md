# cyrusthegreat TODO

## ACTIVE PRIORITIES

Severity markers — use consistently:
- `[P0]` blocking / data integrity / production down / security
- `[P1]` significant UX or functional gap, workaround exists
- `[P2]` polish / nice-to-have / not blocking field use
- `[P3]` future feature, not committed

---

### Mainnet roadmap (revenue-generating critical path)

Per `docs/MAINNET_DEPLOY_CHECKLIST.md` — these BLOCK mainnet launch.
None of these are "engineering" — they're the legal / financial / process work
that turns the verified testnet code into a real product.

- [P0] **Solidity audit — RFP and engagement.** Required before any mainnet deploy
  (Tornado Cash precedent). Budget $80-150K, lead time 8-14 weeks E2E (2-4w
  scheduling + 4-8w audit + 1-2w remediation). Firms: Trail of Bits / OpenZeppelin /
  Spearbit / Code4rena. **First action: draft RFP today** (scope, target dates, budget
  range, repo link). Start the calendar clock running. See MAINNET_DEPLOY_CHECKLIST § B.

- [P0] **Foundation / jurisdiction + crypto-specialist counsel.** US-based launch
  of a privacy protocol is post-Tornado-Cash high-risk. Pick Cayman / Liechtenstein /
  Switzerland Crypto Valley. Lawyer reviews contracts + UI copy + whitepaper + OFAC
  policy before any launch announcement. See MAINNET_DEPLOY_CHECKLIST § A.

- [P0] **Production `feeCollector` multisig.** Current testnet contracts hardcoded
  `feeCollector = WALLET1_PUBK` (dev burner). Mainnet needs a Safe (gnosis-safe.io)
  multisig with 2-of-3 or 3-of-5 signers, geographically distributed, hardware-wallet
  privkeys. Decide signers + procure hardware wallets. See MAINNET_DEPLOY_CHECKLIST § D.

- [P1] **Bug bounty program** active BEFORE mainnet announcement.
  Immunefi or similar. Suggested payouts $1K low / $10K med / $50K high / $100K+ critical.
  Lead time 1-2 weeks. See MAINNET_DEPLOY_CHECKLIST § G.

- [P1] **Public roadmap commit** so users know what privacy tier to expect when.
  v1 = k-anonymity (k×bucket cohort), v2 = full ZK (Tornado-grade). Document in
  marketing / dapp UI.

### Engineering — Tier 1 polish (this week / next week)

- [P1] **Local `main` / `origin/main` divergence sort-out.** Local main is 86 ahead /
  61 behind origin (heavy Portal experimentation stack). Now that `sync-2026-05-13`
  is on origin, the cleanest path: (a) save local main to a `portal-experiment-2025-08`
  branch for posterity, (b) reset local main to match origin/main, (c) delete the
  Portal experimentation stack, (d) merge sync-2026-05-13 into local main once it's
  ready to ship. Own session.

- [P1] **Replicate CyrusTresor1 ct-test matrix on BSC Testnet + Base Sepolia.**
  Per workflow_rules.md Rule 4 (prototype on canonical, then replicate). Bytecode is
  identical across chains (same source, same toolchain) so risk of finding new bugs
  is low, but the disciplined move. ~2h wall-clock per chain (1-epoch wait).

- [P2] **6-decimal display fix** for Notebook + Claim page. Currently formats all
  amounts with `formatEther` (18 dec). Sepolia hides this (USD1 deployed there has 18
  decimals) but mainnet USDC/USDT have 6 decimals — would display ~3 trillion USDC
  for a 3 USDC bucket. Fix via `useTokenDecimals(token)` + `formatUnits(amount, decimals)`.

- [P2] **ERC-20 reveal path** — currently reveal works for any token but the dapp
  doesn't proactively notify the user that bucket amount X is the un-revealed amount
  (which they expect to get back). Add a clearer "you will receive X TOKEN at withdrawTo"
  card on the Claim page.

- [P2] **QR scanner on Claim page** — paste/photo upload + decode for the recipient
  who got the URL via QR rather than text. Library: `qr-scanner` or similar.

### Engineering — Tier 2 features (post-mainnet OR pre-launch differentiation)

- [P2] **CyrusTresor1.1 — multi-round mixing.** Portal11's only valuable contribution:
  chain a commitment through 2-5 rounds for k^N anonymity instead of plain k. Must use
  per-commitment scoping (Portal11's global-clear bug DON'T port). Spec is half-written
  in tech_learnings.md L-006 lessons. ~1w design + 2-3w dev + audit delta. Adds real
  privacy WITHOUT requiring ZK.

- [P2] **HyperEVM 4th chain deploy.** Cheap gas + 1s blocks. Differentiation. Per
  earlier strategy discussion: 1 day of work (add to hardhat config, deploy, verify,
  add to UI). Independent of mainnet decision.

- [P3] **Yield-bearing pool wrapper** (Aave v3 USDC pool). Parked capital earns 3-5%
  APY; spread between earned APY and what's returned to user → fee_collector. SEPARATE
  contract (audited separately) wrapping CyrusTresor1, not baked into the core. Real
  attack-surface increase — only after the core is mainnet + battle-tested.

- [P3] **CyrusTresor2 — full ZK upgrade.** Tornado/Aztec/Railgun-grade real anonymity
  via zk-SNARK proofs. New verifier contract + Merkle tree of commitments + ZK circuit
  development. Multi-month cryptography work + new audit. Triggers an entirely
  different legal risk profile (Tornado precedent applies).

- [P3] **Cross-chain teleport via LayerZero.** New TAM: send-on-A, claim-on-B with
  the same anonymity primitive. Requires LayerZero integration on both ends. 1-2
  months + audit.

- [P3] **Token + governance** ($CTG, ICO/IDO). Regulatory minefield (US securities
  law, RWA classification). Defer until product-market fit + foundation infrastructure
  in place.

### Open strategic questions

- [P2] **Bank9 mystery** — orphan tests reference functions not in Bank8:
  `registered()`, `registerWithWLFI()`, `mixUSD1()`. Inspiration source for
  CyrusTresor1.1 multi-round? Or discarded experiment to delete? Locations to check:
  `solana-reown-integration` branch, `CTGANDRAILGUN/`, Etherscan-verified source on
  whatever address the tests resolve to.

- [P2] **Solana integration** — finish or drop? `contracts/solana/` has full Anchor
  program + IDL + integration guide written, but zero frontend wiring. Probably weeks
  of work to finish (wallet adapter, hooks, UI). Drop = delete the code, stop maintaining
  the env slots. **Decision needed.**

- [P3] **`CYRUS/CTGANDRAILGUN/` folder** (35 GB) — RailGun-fork study folder. Might
  contain useful ZK design ideas for CyrusTresor2. Worth a session of investigation if
  ZK upgrade becomes a priority. Otherwise can stay archived.

### Documentation hygiene (low-priority cleanup)

- [P2] **`CURRENT_STATUS.md` is stale** (December 2024 dating). Either delete or
  replace with a one-line pointer to BRAIN.md.

- [P2] **Multiple overlapping legacy docs** (`AI_PROJECT_GUIDE.md`,
  `CODEBASE_ARCHITECTURE.md` 159 KB, `MASTER_PROJECT_DOCUMENTATION.md`,
  `MODULAR_MIGRATION_GUIDE.md`, `GRADUAL_MIGRATION_STEPS.md`,
  `DECIMAL_FORMATTING_JOURNEY.md`). Consolidate into BRAIN.md + `docs/` for the useful
  subset, archive the rest under `_archive/legacy-session-notes/`.

- [P3] **`useVault.ts` is ~2263 lines.** Single mega-hook is ADR-002 by design but at
  this size it's hard to navigate. Consider extracting per-feature hooks (one per
  contract function group) — only when the size becomes genuinely painful.

### Security (acknowledged, mainnet-blockers handled above)

- [Documented, P0-on-mainnet] **Private keys on disk in plaintext.** `cyrusthegreat/.env`
  contains `WALLET1_PRIVK` + `WALLET2_PRIVK`. Per L-008 / workflow_rules Rule 10:
  these are forever-Sepolia-only burner wallets — public 9 months without harm
  (Sept 2025 → 2026-05). NEVER use on mainnet. For mainnet: generate fresh keys at
  deploy time, store in hardware wallet / age-encrypted keystore. See
  MAINNET_DEPLOY_CHECKLIST § C + Rule 10.

---

## CLOSED 2026-05-18 (CyrusTresor1 frontend integration + chain-switch fixes)

- DONE  **CyrusTresor1 deployed + verified on Sepolia / BSC Testnet / Base Sepolia.**
  Sepolia `0x223E25F961E29AaCc3dB49e5b00B30452D42c65e`,
  BSC Testnet `0xa2D2A04d6eE5887f20bF736E1d9014727d599F39`,
  Base Sepolia `0xc90610ce4DE152349932Af102650b6c9f8C6AD68`.
  Source verified on Etherscan / BSCScan / BaseScan. Deployment records in
  `tools/hardhat-deploy/deployments/cyrustresor1-*.json`.

- DONE  **CyrusTresor1 verified end-to-end on Sepolia 2026-05-17.** Three layers:
  (1) Foundry suite 27/27 passing; (2) debug-UI ct-tests 1→8 passing including
  collectFees revenue withdrawal; (3) frontend flow (commit + reveal both ETH AND
  USD1) — commit tx `0xf181d72a…` / reveal tx `0x79e50e37…` / USD1 commit tx
  `0x?? in user notes` / USD1 reveal pending epoch 494204 (23:00 UTC 2026-05-17).

- DONE  **Frontend v1/v2 mode toggle** (F.4a → F.4d, F.6, F.8, F.10). Pool UI gated
  by `VITE_ENABLE_POOL` so the live cyrusthegreat.dev (origin/main) stays unchanged.
  Components: PoolView, CommitForm, Notebook, Claim page (`/claim`), ClaimQR,
  ChainSwitcher. usePool hook with commit / reveal / revealFromURL / approveToken /
  notebook dedup / current-epoch / current-fee / bucket-sizes.

- DONE  **MAINNET_DEPLOY_CHECKLIST.md** in `docs/`. ~200-line runbook covering legal,
  audit, contract config, operational, post-deploy verification, and revenue /
  communication preconditions. Stablecoin-first token scope locked in (ETH + USDC +
  USDT + USD1 if real adoption).

- DONE  **CyrusTresor1 paper spec** (`docs/cyrustresor1_spec.md`) — 247 lines covering
  threat model, architecture, epoch mechanics, denomination buckets, pool commit/reveal,
  storage scoping, MEV/replay protection, ZK extensibility hook, multi-chain
  considerations. All design decisions resolved (architecture A: Bank8 + pool layer;
  epoch 1h; configurable buckets; commit-only fees; constructor-immutable zkVerifier).

- DONE  **`tools/hardhat-deploy/` recovery.** Pipeline was broken (broken paths,
  missing node_modules). Rebuilt: `paths.root = "../../"` for canonical contract
  location, `@openzeppelin@4.9.6 + @chainlink@1.2.0` added to repo-root devDeps,
  Etherscan v2 single-key migration (v1 deprecated 2025-05-31), deploy + verify
  scripts written, deployment records committed. Resolves the original 2026-05-08
  P1 about hardcoded paths.

- DONE  **Foundry test framework** in-repo at `tools/foundry-tests/`. 27/27 tests
  passing in ~5ms. Covers constructor validation, view assertions, commitToPool
  reverts (reuse, bad bucket, wrong msg.value, ERC-20 path), revealFromPool reverts
  (same-epoch, unknown, MEV-redirect, double-spend, wrong bucket, zero withdrawTo),
  Bank8 surface regression spot-check. forge-std vendored at `tools/foundry-tests/lib/`
  (submodules don't play well with worktrees).

- DONE  **L-010 (wallet RPC health is a write-path-only failure mode)** added to
  `tech_learnings.md`. Lesson from the Zerion wallet debugging session.

- DONE  **`sync-2026-05-13` branch pushed to origin** at `adde46b`. 39 commits ahead
  of origin/main, all clean, all single-intent. Per Rule 1. Includes secret-scrub of
  an Alchemy key suffix that was accidentally documented in a session log (used
  `git filter-repo --replace-text` scoped to the branch only, same tool as 2026-05-09
  security incident).

- DONE  **v1 chain switcher bug fix.** The `metamask.js` helpers were calling
  `window.ethereum.request` directly — silently no-op under WalletConnect/Reown
  (which the dapp uses). Replaced with wagmi's imperative `switchChain()`. Closes the
  bug where clicking tBSC / tBASE did nothing on the dapp.

- DONE  **v2 ChainSwitcher** added so users can change chain without leaving pool
  mode. Same UX as v1's button grid + a "wallet on X, click Y to sync" warning when
  the wallet and dapp diverge.

## CLOSED 2026-05-09 (Bank8 promotion + security incident response)

- DONE  **Bank8 promoted live on cyrusthegreat.dev** (all 3 chains). End-to-end
  verified by user with a real deposit tx. Bundle `index-DG1Do22v.js` calls Bank8
  addresses on Sepolia / BSC Testnet / Base Sepolia. Resolves the original 2026-05-08
  P0 "production frontend talks to Bank5."

- DONE  **Security incident — leaked API keys + privkeys in commit `9674fa8` (Sept 2025).**
  `git filter-repo --replace-text` scrubbed 8 secrets across all branches; force-pushed
  clean history. API keys rotated (Alchemy + Etherscan + BSCScan). Wallet privkeys
  NOT rotated — per user decision, treated as forever-Sepolia-only burner wallets
  (survived 9 months public without harm; rotating doesn't help if they stay on disk
  anyway). See L-008 in tech_learnings.md.

- DONE  **Cloudflare auto-deploy mechanism via `tools/cf-sync-env.sh`** (alias
  `ctg-sync-env` in ~/.zshrc). One command syncs `.env` → Cloudflare Pages env vars
  via API. Credentials sourced from `~/.config/cyrusthegreat/cloudflare.env` (mode 600).

- DONE  **Bank8 fee withdrawal test (b8-12 collectFees)** verified on real Sepolia.
  Owner-only check passes; non-owner reverts.

- DONE  **EIP-55 checksum incident** — `viem 2.48+` enforces strict casing, broke
  every contract call on live site. Fixed by normalizing all addresses via
  `ethers.getAddress(addr.toLowerCase())` everywhere. See L-007 in tech_learnings.md.

- SUPERSEDED  ~~Portal11 4 known bugs (`_clearPrivacyStorage`, missing reveal fee,
  stale ETH price slots, fake MEV protection) + zero tests + unknown deploy status.~~
  Portal11 is **superseded by CyrusTresor1** (built 2026-05-13 → 2026-05-18) which
  has none of those bugs. Portal11 will not be deployed; its source stays in repo as
  a research artifact + history of mistakes that informed CyrusTresor1's design.

## CLOSED 2026-05-08

- DONE  Disambiguate the three folders `cyrusthegreat`, `ctg_1`, `ctg_2` — VERIFIED 2026-05-08. Root cause: three iterations of the same product (vaultwhisper → cyrus-vault → cyrus-the-great) plus a deploy-tools monorepo that was never collapsed into the main project. Fix: `tools/` and `_archive/` created at `CYRUS/` level; manifests in each. Verified: file structure (see BRAIN.md "Recent context").
- DONE  Identify the live-matching state of cyrusthegreat — VERIFIED 2026-05-08. Root cause: the source state matching cyrusthegreat.dev was "somewhere" — turned out to be the `backup` branch (`cc2d992 v1.17.55`). Verified: `git ls-tree backup | grep portal` returns empty (no Portal); `curl https://cyrusthegreat.dev/assets/index-wFiv6NE4.js | grep -o '0x[a-fA-F0-9]\{40\}'` returns Bank5 `0x3d6e43...B4` matching ctg_2's hardcoded address.
- DONE  **Bank8 Phase A verification (all 7 functions)** — VERIFIED 2026-05-08 on Sepolia at `0xb83A...`. Root cause for verifying: Bank5's multi-token batch reverted with empty data (`0x`) when ETH was in the array; Bank8's commit `v1.17.17` removed the offending `require(token != address(0))`. Fix: built `tools/contract-debug/` (single static HTML, ABI-driven, smart token picker, address book, vault state widget) and ran the 7-test matrix end-to-end on Sepolia. Verified: tx hashes recorded in tests_evm/ via the debug tool — `0xa76d…5023` (single ETH deposit), `0x2c85…cbfe` (multi-token deposit USD1+WLFI), `0xeac1…291e` (internal transfer 0.02505 ETH), `0x79d8…1664` (withdraw 0.02505 ETH), `0x1bb2…0c2b` (multi-token withdraw 625 WLFI + 320 USD1). Bank5 bug confirmed FIXED in both deposit and withdraw paths.
