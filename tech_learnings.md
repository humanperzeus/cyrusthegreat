# cyrusthegreat Technical Learnings

Universal patterns extracted from this project's bug history. When a bug's root cause is interesting beyond "this specific code was wrong," append it here as a section.

---

## L-001: Source of truth for "deployed state" is the deployed artifact, not the source code (2026-05-08)

**Pattern:** when a project has been redeployed multiple times, the local `.env` reflects what local code *intends* to talk to, not what production *actually* talks to. These can diverge silently — and when they do, you waste hours debugging a bug that doesn't exist in the deployment users hit.

**This project's incident:** local `.env` had `VITE_CTGVAULT_ETH_TESTNET_CONTRACT=0xb83A81...87a` (CrossChainBank8). I assumed that was what was live. It wasn't — `cyrusthegreat.dev` was still serving an older bundle pointing at `0x3d6e43cbf157110015edF062173BbeBF78De61B4` (CrossChainBank5).

**How to apply:** the canonical "what is live" check for any web-deployed dapp:
```
curl -s https://<your-domain> | grep -o '/assets/index-[A-Za-z0-9_-]*\.js'
curl -sL https://<your-domain>/assets/index-XXXX.js | grep -oE '0x[a-fA-F0-9]{40}' | sort -u
```
Run this at the start of any session that might touch contract logic. The answer is authoritative; the local env is just intent.

**Universalises:** any deployed system. The deployed binary / bundle / image is ground truth. Source code in your editor is one possible future of it.

---

## L-002: macOS hardened runtime + bundled-app node will refuse third-party native modules (2026-05-08)

**Pattern:** a node binary that ships inside another macOS app's bundle (here: `/Applications/Codex.app/Contents/Resources/node`) inherits that app's hardened-runtime + library-validation entitlements. It will then refuse to load any native `.node` module that's signed by a different team (e.g. Vercel-signed Next.js SWC), with errors like "different Team IDs" or "Trying to load an unsigned library." Stripping or ad-hoc-signing the binary doesn't help — kernel signature caching or Library Validation gets you anyway.

**This project's incident:** trying to start `next dev` for ctg_1's frontend and ctg_2 failed repeatedly with `Failed to load SWC binary for darwin/arm64`. Three different fix attempts (delete binary → reinstall, strip signature, ad-hoc resign with fresh inode) all failed before the root cause became clear.

**How to apply:** when a native node module fails to load on macOS with a code-signing error, **first** check `which node`. If it's inside an app bundle (path contains `.app/Contents/...`), that's the issue. Switch to a system / nvm / homebrew node and the error goes away. Don't waste time on `codesign` — the host is the problem, not the module.

**Universalises:** any macOS native-binding loading issue. The host's entitlements determine what plugins it'll accept; you can't fix the plugin to satisfy a paranoid host.

---

## L-003: When a project rewrites itself, audit each capability separately for migration (2026-05-08)

**Pattern:** when v1 of a project gets superseded by v2, it's tempting to declare v1 obsolete and archive it. But "supersede" usually means "the new version replicates the user-visible features"; supporting tooling (deploy scripts, test harnesses, ops runbooks) often gets silently dropped. If you don't audit each capability, you can lose ability to deploy, debug, or recover from incidents — silently, until you need it.

**This project's incident:** I claimed `ctg_1`'s hardhat workspace was "fully absorbed" by `cyrusthegreat/tests_evm/`. The user pushed back. On verification: `tests_evm/` only has *runtime testing* (calls a deployed contract over JSON-RPC). It has no `hardhat.config.ts`, no compile pipeline, no deploy scripts. `ctg_1/hardhat/` was the **only** way to deploy a new contract. Archiving it would have lost that ability.

**How to apply:** when any "v1 → v2" migration is on the table, list every capability of v1 and verify each one is preserved in v2 *or explicitly dropped on purpose*. For each capability, find one concrete file or command in v2 that owns it. If you can't, v2 hasn't actually replaced v1 — it's just the user-facing slice.

**Universalises:** any system-replacement decision. The thing that bites is always the unglamorous capability nobody noticed v1 was providing.

---

## L-005: Test files referencing missing source = live deployments not preserved in repo (2026-05-08)

**Pattern:** when test files reference contract functions that don't exist in any contract source in the repo (e.g. `vault.registered()` called in tests, but `registered()` is nowhere in the .sol files), the tests are not stale — they're hitting a *deployed* contract whose source has been deleted, moved, or never committed. Treat it as a partial-source-loss event, not as broken tests.

**This project's incident:** `tests_evm/testing-contract/test-crosschainbank9.cjs` (and 4 siblings) test `vault.registered()`, `vault.registerWithWLFI()`, `vault.mixUSD1()`. None of these functions are in `CrossChainBank8.sol`. The tests pass against a contract address loaded from `config-multi-network.cjs` that points to *something* on-chain — that something is "Bank9," a deployment whose source isn't in this repo. The dev probably had Bank9 source in a folder that got deleted between contract iterations.

**How to apply:** when tests reference unknown functions, before assuming they're stale:
1. `git log -- <test-file>` — see when the test was written; was it for a contract that existed in repo at that time?
2. Find the contract address the tests use (usually loaded from a config file). Check the address on Etherscan / blockscanner — the on-chain bytecode is the only canonical record left.
3. If verified on-chain, decompile or recover the source. If not verified, the *bytecode* is the source-of-truth.
4. Don't delete the orphan tests until you've decided whether to absorb the missing contract's features back into the maintained contract or discard the experiment.

**Universalises:** any time a project loses source coherence across iterations — the on-chain state (or other deployed artifacts) becomes the only authoritative record of features that were tried.

---

## L-006: "Compiles" ≠ "works" — read the source for half-baked features (2026-05-08)

**Pattern:** a contract that compiles cleanly can still be fundamentally broken at runtime. "It compiles" is the lowest possible bar. Compile-clean contracts can have:
- Functions defined but never called from anywhere (dead branches)
- State-clearing logic that wipes too much (operating on all keys instead of one)
- Storage redundancy where two paths claim the same data and disagree
- Marketing claims in docstrings that don't match implementation

These won't trip up the Solidity compiler but will trip up users — sometimes catastrophically.

**This project's incident:** `CyrusPortal11.sol` compiles fine. But it has at least four runtime bugs (see TODO.md "Portal feature" section, P0 items): missing fee charge on reveal path, never-called price-update function, `_clearPrivacyStorage()` that deletes all users' data, claimed MEV protection that's only a 2-block delay. None of these were caught because there were no tests, and "compiles" was being used as a proxy for "ready."

**How to apply:** for any new contract before deploy:
1. Run grep across the contract source for every defined function — does the frontend or another function actually *call* each one? Functions defined but never invoked are red flags.
2. For every storage-clearing function, write a test that creates state for two users and verifies clearing one doesn't affect the other.
3. For every claim in the docstring (`@notice MEV protection`, `@notice atomic`, etc.), find the line of code that delivers it. If you can't, delete the claim or implement it.

**Universalises:** "compiles" is necessary but not sufficient. The set of valid Solidity programs that don't do what their author intended is much larger than the set that don't compile.

---

## L-004: Don't dismiss a "dead" folder by surface signals; verify (2026-05-08)

**Pattern:** "0 commits + dependency mismatches + broken imports" looks like dead code. But it can also be *deploy-tooling that lived alongside a frontend, where only the frontend broke* — the deploy half might still be the only working pipeline.

**This project's incident:** my first read of `ctg_1` was "0 commits, broken Next.js scaffold, dead-end." User pushed back: "I'm sure I had it for a reason." Investigation found the `hardhat/` workspace + deploy script — the only one that exists in the lineage. If I'd archived `ctg_1` wholesale, the project would have lost its deploy ability.

**How to apply:** before declaring any folder dead, run these checks:
- `find <folder> -name "*.sol" -o -name "*.rs" -o -name "deploy*"` — looks for contract source / deploy scripts
- `grep -r "private_key\|FEE_COLLECTOR\|PROD" <folder>/.env` — looks for live keys / prod links
- `find <folder> -name "*.md" -exec head -1 {} \;` — read the first line of every doc; surprise findings are common

If any of those return non-trivial content, the folder probably has unique value, even if a subfolder looks broken.

**Universalises:** any time you're tempted to `rm -rf` something based on surface impressions. Verify capability-by-capability, not folder-by-folder.

---
