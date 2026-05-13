# cyrusthegreat Technical Learnings

Universal patterns extracted from this project's bug history. When a bug's root cause is interesting beyond "this specific code was wrong," append it here as a section.

---

## L-007: viem 2.48+ enforces EIP-55 checksum casing — silent in viem 2.36 (2026-05-09)

**Pattern:** Ethereum address strings have a `0x` prefix + 40 hex characters, which is case-insensitive at the protocol level but EIP-55 *encodes a checksum* via the casing. Older Web3 client libraries (ethers v5, viem ≤ 2.36) treat the casing as informational; if you give them a non-EIP-55-correct address, they accept it (and may auto-normalize). Newer libraries (viem ≥ 2.48) **refuse to send the transaction** with `InvalidAddressError: Address must match its checksum counterpart`.

**This project's incident:** the day after promoting Bank8 to production, the live site failed every contract call with "Failed to get fresh fee" → on inspection, `InvalidAddressError` for `0xb83A814097C70DB79568b663662eA07e77D4D87a`. The correct EIP-55 form is `0xb83A814097C70dB79568b663662eA07e77D4D87a` (lowercase `d` at position 12). The bad casing had been in `.env` and Cloudflare env vars for months without triggering anything because viem 2.36.0 in the lock file accepted it silently. The lockfile regen that fixed the Cloudflare build (L unrelated, but same morning) upgraded viem to 2.48.11 — and 2.48 enforces EIP-55. So the fix unmasked the latent bug.

**How to apply:**
1. **Always run new addresses through `ethers.getAddress(addr.toLowerCase())` or viem's `getAddress(addr)` before storing them** — that returns the canonical EIP-55 form. Pasting from Etherscan or block explorers usually gives you the correct form, but pasting from a transaction's `to:` field or from a hand-typed address can introduce wrong casing.
2. For each address you store in `.env`, deploy scripts, hardcoded source, or env vars: validate with `getAddress()` once, store the canonical form, and add a startup-time check (or test) that all configured addresses round-trip through `getAddress()` unchanged.
3. When upgrading wagmi / viem versions, **do an end-to-end smoke test on testnet immediately after deploy** — strict-checksum failures are NOT caught by `npm run build` because the addresses live in env vars, not source.

**Universalises:** any time a library upgrade tightens validation that was previously permissive, latent data-quality bugs get exposed. The fix is data hygiene at the source (canonicalize on entry), not relaxing validation downstream.

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

## L-008: Public-repo threat model ≠ public-bundle threat model (2026-05-09)

**Pattern:** Frontend dapps inevitably bake API keys into their public JS bundle (any browser can read them). Tempting reasoning: "they're already public anyway, so committing them to git is no marginal exposure." This is wrong. The two threat models are different:

- **Public bundle**: targeted reader who knows your domain, fetches the JS, and greps. Exists, but not at scale.
- **Public GitHub repo**: continuously crawled by GitGuardian, TruffleHog, and dozens of automated scrapers. Plus GitHub itself runs *secret-scanning partnerships* with major providers (Alchemy, AWS, Stripe, etc.) that **auto-revoke leaked credentials** within minutes of a push. Plus search engines index file content for fuzzy matching.

The same API key has very different fates in those two locations.

**This project's incident:** committed `.env.production` with all `VITE_*` values including 4 API keys — reasoning was "they're in the bundle anyway, this is fine." Within hours: Alchemy auto-deactivated the entire app (HTTP 403 "App is inactive"), Etherscan + BSCScan revoked their keys (Invalid API Key #err2). The live site went into a degraded state until rotation. Discovered during incident triage that the same keys were also leaked back in Sept 2025 in a deploy script — but those hadn't auto-revoked then because GitHub's partnership program coverage and trigger sensitivity has tightened over time.

**How to apply:**
1. **Never commit credentials to a public git repo, regardless of "they're already exposed" reasoning.** Different threat model.
2. For dapp env vars that *must* end up in the bundle (Alchemy, Ankr, etc.): keep them in your local `.env` (gitignored) + your hosting provider's dashboard env-var system (Cloudflare Pages, Vercel, Netlify all have one). The bundle gets them at build time; git doesn't.
3. Treat `provider partnerships` (Alchemy ↔ GitHub, etc.) as a feature, not a hostile act — they catch your mistakes faster than scrapers do. But that means rotation IS forced if you do leak.
4. For non-secret build config (contract addresses, network mode, public RPC URLs): committing them is fine — they're not credentials. Just don't co-mingle with secrets.

**Universalises:** any deployment-config decision. "Where can it leak from?" has different answers depending on where it lives. Code in a public repo is loud; the same code in a private bundle on a known domain is quiet. Plan for the loudest channel.

---

## L-009: Don't duplicate the same secret across N config keys (2026-05-09)

**Pattern:** When configuration has N entries that all embed the same credential (typical: per-chain RPC URLs that all encode the same API key in their path), and the secret rotates infrequently — every rotation forces updating N places. Errors compound (one missed entry = stale credential in production).

The fix is a **single source + composition pattern**: store the secret once, compose the N derived values in code at the point of use.

**This project's incident:** `.env` had:
```
VITE_ALCHEMY_API_KEY=<key>
VITE_ALCHEMY_ETH_MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<key>
VITE_ALCHEMY_ETH_TESTNET_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
... 6 more URLs, all with the same key embedded ...
```

When the user rotated Alchemy, they had to update 9 lines instead of 1 (key + 8 URLs). Same pattern for Ankr (1 + 6). They missed at least one URL initially during the rotation, leading to the live site briefly running with mixed-key config.

**How to apply:**
- Store the secret **once** in env (`VITE_ALCHEMY_API_KEY=<key>`).
- Define a small chain-slug map in code:
  ```ts
  const ALCHEMY_SUBDOMAIN = { eth_mainnet: 'eth-mainnet', eth_testnet: 'eth-sepolia', /* ... */ };
  export const alchemyRpc = (chain) => `https://${ALCHEMY_SUBDOMAIN[chain]}.g.alchemy.com/v2/${import.meta.env.VITE_ALCHEMY_API_KEY}`;
  ```
- Replace every `VITE_ALCHEMY_*_RPC_URL` reference with `alchemyRpc('chain_name')`.

**Universalises:** any time the same value appears in multiple env vars. Especially relevant for: per-chain RPC URLs (multi-chain dapps), per-environment connection strings, per-region endpoints. When you add a new chain, you change one map entry instead of adding two env vars.

---

## L-010: Wallet RPC health is a write-path-only failure; reads can be insulated, writes can't (2026-05-13)

**Pattern:** A dapp's reads and writes have different RPC dependencies. **Reads** can use any RPC you point ethers/viem at — wallet-injected provider, public RPC, your own Alchemy key, anything. **Writes** must go through the wallet's `eth_sendTransaction`, which uses **the wallet's own RPC backend** to broadcast (and usually to fetch nonce + fee data before signing). If the wallet's RPC is down, no amount of dapp-side fallback fixes it — `eth_signTransaction` also tends to route through the same backend, and most modern wallets don't expose `eth_signTransaction` for security reasons anyway.

**This project's incident:** Testing CrossChainBank8 via the debug UI from a Zerion-connected browser. Every read worked once we routed through `getReadProvider()` (public RPC). Every write failed with `could not coalesce error` → underlying `Request failed with status code 404` from the wallet. A per-method probe (`window.ethereum.request({method: ...})` against `eth_chainId`, `eth_blockNumber`, `eth_gasPrice`, `eth_getTransactionCount`, …) showed: locally-cacheable methods (`eth_chainId`, `eth_accounts`, `net_version`) returned correct values; everything that had to hit a Sepolia node returned 404. The wallet's backend was simply down for Sepolia. Tried pre-populating nonce/fees/chainId from the working read RPC + setting hardcoded gasLimit + falling back to `eth_signTransaction` — none mattered because the wallet routed every chain-touching call through one dead gateway.

**How to apply:**
1. When a write tx fails with opaque `could not coalesce error`, walk `e.cause` / `e.error` / `e.errors` to find the real underlying error. Build a `formatErr()` helper that prints the full nested chain — opaque coalesce errors are the symptom of multiple parallel calls failing simultaneously.
2. Diagnose wallet RPC health independently of dapp code: per-method probe of `window.ethereum.request()` for `eth_blockNumber`, `eth_gasPrice`, `eth_getTransactionCount`, `eth_feeHistory`. If those 404 but `eth_chainId` works, it's the wallet's backend, not your dapp.
3. Once confirmed wallet-side: **don't waste cycles trying to route around the wallet from JS**. Browser wallets are designed so the wallet owns the RPC trust boundary; `eth_signTransaction` is unsupported or behaves identically to `eth_sendTransaction` on almost every modern wallet. Tell the user to either (a) switch wallets, or (b) add a custom network in their wallet pointing at a working RPC.
4. For dapps, this means **read paths should always use a dapp-controlled RPC** (`getReadProvider()` with multiple public-RPC fallbacks + a chain-probe at connect). It removes wallet-RPC health from the read-side equation entirely. Writes remain coupled to wallet health — that's an unavoidable trust boundary.

**Universalises:** in any architecture where the user supplies an authentication-bearing intermediary (a wallet, a browser extension, an OAuth proxy), reads and writes have different dependency surfaces. Reads can use your own backend; writes are gated by the intermediary's health. When designing a debug surface, instrument the wallet-side RPC directly with a per-method probe so you can tell "their broken backend" apart from "my code is wrong."

---
