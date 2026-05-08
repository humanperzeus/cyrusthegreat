# cyrusthegreat TODO

## ACTIVE PRIORITIES

Severity markers — use consistently:
- `[P0]` blocking / data integrity / production down / security
- `[P1]` significant UX or functional gap, workaround exists
- `[P2]` polish / nice-to-have / not blocking field use
- `[P3]` future feature, not committed

---

### Production / deployment state

- [P0] **Decide fate of the 16 unpushed local commits + 3 uncommitted Portal edits.** Local `main` is 16 commits ahead of `origin/main`, all "pre v9/v10" scratch labels (Portal feature). Plus uncommitted fee-model rewrite to `commitDeposit`. Either: (a) polish into proper commits and push, (b) squash and rewrite messages, or (c) abandon and reset to `origin/main`. **Why P0:** as long as this exists, "what's on main" is not reproducible and any teammate (including future-you) can't tell what state was intended.

- [P0] **Production frontend talks to old contract (Bank5 `0x3d6e43...B4`); local main targets newer Bank8 (`0xb83A...`).** Bank8 is deployed on Sepolia testnet AND **verified working 2026-05-08** (see CLOSED). Now ready to promote. Migration concern dropped per user 2026-05-08 ("just testnet, ignore Bank5"). Remaining decision: how to deploy Bank8 to cyrusthegreat.dev cleanly without shipping the unfinished Portal11 work that's currently sitting in 16 unpushed commits + uncommitted edits on `main`. Cleanest path: (a) save current main to a `portal-experiment` branch, (b) build cyrusthegreat from `backup` branch with current `.env` (which already points at Bank8), (c) deploy to Cloudflare Pages, (d) verify live bundle hash + contract address. See "Phase A Step 4" notes when ready.

- [P1] **All mainnet deployments are `notdeployednow` in `.env`.** No EVM mainnet, no BSC mainnet, no Base mainnet, no Solana mainnet. Make an explicit go/no-go decision: do we ship to a mainnet at all? If yes, which order, with what audit posture? If no, document that this is a testnet-only project and stop maintaining mainnet env slots.

### Portal feature

- [P0] **Portal11 bug — `_clearPrivacyStorage()` wipes ALL users' data.** [contracts/evm/CyrusPortal11.sol:853-858](contracts/evm/CyrusPortal11.sol:853) loops over `userEncryptedCommitments[]` etc. and `delete`s the storage slot for every key, not the calling user. **First successful `teleportBack()` will brick the contract for every other user.** Fix before any deploy, even testnet.

- [P0] **Portal11 bug — fees not charged on reveal.** [contracts/evm/CyrusPortal11.sol:694](contracts/evm/CyrusPortal11.sol:694) `revealDeposit()` recalculates a fee value but never calls `_chargeFeeWithRefund()`. Reveals are free, breaking the project's revenue model. The 3 uncommitted Portal edits in working tree are starting to fix this (moving fees to per-mixing-round); finish the fix and verify the math.

- [P0] **Portal11 bug — ETH price slots never refresh.** [contracts/evm/CyrusPortal11.sol:782](contracts/evm/CyrusPortal11.sol:782) `_updateETHAmountsToCurrentPrice()` is defined but never called from anywhere. The 8 fixed amount slots get their ETH-equivalent set once at construction and silently drift as ETH/USD moves. Either add it to a deposit/reveal hook with a TTL check, or document that the slots are USD1-only.

- [P0] **Portal11 bug — claimed "MEV protection" is just a 2-block commit-reveal delay.** No batch matching, no sandwich-attack mitigation, no MEV-Boost-style commitment ordering. Either deliver real MEV protection or delete the marketing claim from the contract docstring (line 13) and from any UI copy.

- [P0] **`CyrusPortal11.sol` has zero automated tests.** Frontend code (`src/components/portal/*`, `src/hooks/usePortal.ts`) exists, contract is 1042 lines with commit-reveal + multi-round mixing + variable amount slots, but no test in `tests_evm/` covers Portal. **Required before any Portal deploy.** Each of the 4 bugs above should have a regression test as part of the fix.

- [P1] **Portal11 race condition — commitment data stored in two places.** Per-user arrays (`userEncryptedCommitments[]`, `userCommitmentAmounts[]`) AND global `commitmentAmounts` mapping. `teleportBack()` reads from the global mapping and ignores per-user arrays. If a user reveals multiple deposits in one transaction, the per-user array indexing can desync from the global mapping. Either: (i) eliminate one storage path, or (ii) add invariant tests.

- [P1] **Deployment status of `CyrusPortal11.sol` is unknown.** Need to either deploy to Sepolia (after the 4 P0 fixes above) and record the address in `.env` + BRAIN.md, or document that Portal is not yet on-chain.

### Bank9 mystery

- [P1] **Find Bank9's source.** `tests_evm/testing-contract/test-crosschainbank9.cjs` and 4 sibling test files reference contract functions that don't exist in Bank8: `registered()`, `registerWithWLFI()`, `mixUSD1()`, plus WLFI gating and USD1 denomination mixing. So Bank9 is a real deployment with extra features, source not in this repo. Possible locations:
  - The `solana-reown-integration` branch (not yet inspected)
  - Inside `CTGANDRAILGUN/` (35 GB folder, not yet investigated)
  - The Sepolia deployment itself (try Etherscan verified-source for whatever `CROSSCHAINBANK_ADDRESS` resolves to in `src/config-multi-network.cjs`)
  - Lost — was held in a folder that's been deleted
- Action: locate the source, decide whether Bank9's WLFI/USD1 features are a forward direction or a discarded experiment, then either fold them into Bank8 or delete the orphan tests.

### Solana

- [P1] **Solana program written but never wired into frontend.** `contracts/solana/` has full Anchor program + IDL + types + `FRONTEND_INTEGRATION_GUIDE.md`, but: no Solana hooks, no wallet adapter, no UI components, no tests. `.env` has only a *testnet* program ID. Decide: finish (probably weeks of work — wallet adapter, hooks, components, tests) or drop (delete the Solana code, stop pretending it's a feature).

### Documentation hygiene

- [P1] **`CURRENT_STATUS.md` is stale.** Dated December 2024, claims complete features that have since evolved. Either delete it or replace with a pointer to BRAIN.md.

- [P2] **Multiple overlapping legacy docs** (`AI_PROJECT_GUIDE.md`, `CODEBASE_ARCHITECTURE.md` 159 KB, `MASTER_PROJECT_DOCUMENTATION.md`, `MODULAR_MIGRATION_GUIDE.md`, `GRADUAL_MIGRATION_STEPS.md`, `DECIMAL_FORMATTING_JOURNEY.md`). Consolidate into BRAIN.md + a `docs/` folder with the genuinely useful subset, archive the rest under `_archive/legacy-session-notes/`.

### Security

- [P0] **Private keys on disk in plaintext.** `cyrusthegreat/.env` contains `WALLET1_PRIVK` + `WALLET2_PRIVK`; same `WALLET1_PRIVK` is also at `_archive/ctg_1-env-with-keys/.env`. These are Sepolia-only — but if either wallet ever touched mainnet, those keys are compromised. (a) Confirm Sepolia-only history, (b) rotate before any mainnet use, (c) consider moving secrets to a keystore (1Password CLI, age, etc.).

### Tooling / repo plumbing

- [P1] **`tools/hardhat-deploy/deploy_contracts4.sh` has hardcoded paths that no longer exist** (`./frontend/src/abis`, `./backend/abis` — both gone in this session's cleanup). Fix output paths to write into `cyrusthegreat/src/contracts/abis/` (or wherever the main app reads ABIs). Otherwise the only deploy pipeline is broken.

- [P2] **Commit message hygiene on the 16 unpushed commits.** "pre 10 - 12" tells nobody anything. If keeping, rewrite. If squashing, squash to one or a few semver-tagged commits.

- [P2] **`useVault.ts` is ~2263 lines.** Single mega-hook is OK as ADR-002, but at this size it's hard to navigate. Consider extracting per-feature hooks (one per contract function group).

### Future / unscoped

- [P3] **Investigate `CYRUS/CTGANDRAILGUN/` (35 GB).** Dated Sept 16 — newer than this repo's last commit (Sept 4). Probably contains your most recent direction (RailGun ZK study). Separate session.

- [P3] **`solana-reown-integration` branch** — exists in git, never inspected this session. Could be the start of the Solana frontend integration. Worth a look.

---

## CLOSED 2026-05-08

- DONE  Disambiguate the three folders `cyrusthegreat`, `ctg_1`, `ctg_2` — VERIFIED 2026-05-08. Root cause: three iterations of the same product (vaultwhisper → cyrus-vault → cyrus-the-great) plus a deploy-tools monorepo that was never collapsed into the main project. Fix: `tools/` and `_archive/` created at `CYRUS/` level; manifests in each. Verified: file structure (see BRAIN.md "Recent context").
- DONE  Identify the live-matching state of cyrusthegreat — VERIFIED 2026-05-08. Root cause: the source state matching cyrusthegreat.dev was "somewhere" — turned out to be the `backup` branch (`cc2d992 v1.17.55`). Verified: `git ls-tree backup | grep portal` returns empty (no Portal); `curl https://cyrusthegreat.dev/assets/index-wFiv6NE4.js | grep -o '0x[a-fA-F0-9]\{40\}'` returns Bank5 `0x3d6e43...B4` matching ctg_2's hardcoded address.
- DONE  **Bank8 Phase A verification (all 7 functions)** — VERIFIED 2026-05-08 on Sepolia at `0xb83A...`. Root cause for verifying: Bank5's multi-token batch reverted with empty data (`0x`) when ETH was in the array; Bank8's commit `v1.17.17` removed the offending `require(token != address(0))`. Fix: built `tools/contract-debug/` (single static HTML, ABI-driven, smart token picker, address book, vault state widget) and ran the 7-test matrix end-to-end on Sepolia. Verified: tx hashes recorded in tests_evm/ via the debug tool — `0xa76d…5023` (single ETH deposit), `0x2c85…cbfe` (multi-token deposit USD1+WLFI), `0xeac1…291e` (internal transfer 0.02505 ETH), `0x79d8…1664` (withdraw 0.02505 ETH), `0x1bb2…0c2b` (multi-token withdraw 625 WLFI + 320 USD1). Bank5 bug confirmed FIXED in both deposit and withdraw paths.
