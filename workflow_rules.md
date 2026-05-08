# cyrusthegreat Workflow Rules

These are non-negotiable. Violating any of these is how the project gets lost.

## Rule 1 — ONE intent per shipped artifact
One bug or feature = one branch = one merge = one release/deploy/PR. No batching. Heartbeat over batch size.

**Why:** easier bisect on regression, clearer commit history, faster review. Already validated in this project: the 16 unpushed "pre 10 - X" commits are a case study in what happens when you batch — nobody (including you) can tell what's intended state.

## Rule 2 — Real-environment verification REQUIRED before declaring done
"Working in dev / sim / local" is not the same as working in production / on real hardware / under real load. **Sepolia is not mainnet. Localhost:5173 is not cyrusthegreat.dev.** Mocks do not equal live data.

Don't mark a bug closed until verified in the actual target environment with evidence (transaction hash, screenshot, log line, test pass).

Specific to this project: production state must be checked by reading the deployed bundle, not the local source. Use:
```
curl -s https://cyrusthegreat.dev | grep -o '/assets/index-[A-Za-z0-9_-]*\.js'
curl -sL https://cyrusthegreat.dev/assets/index-XXXX.js | grep -oE '0x[a-fA-F0-9]{40}' | sort -u
```
The contract address that comes out is what's actually live. The local `.env` is a guess about local intent.

## Rule 3 — Diagnose BEFORE coding any fix
When picking up a logged bug, FIRST re-verify it currently reproduces. Many bugs auto-resolve silently between logging and acting. If you can't reproduce it, don't fix it — document and close.

When you DO have a repro, instrument with logs / debugger / tests BEFORE coding the fix. Hypothesis-driven debugging only works if you confirm the hypothesis first.

## Rule 4 — Prototype on canonical surface, then replicate
When a bug or feature affects multiple parallel surfaces (e.g., 3 chains: ETH/BSC/Base, or 4 token modal flows: deposit/withdraw/transfer/multi), pick ONE as the prototype, fix it COMPLETELY (verify on real chain), THEN mechanically replicate to the others. Never batch-change all surfaces at once.

**Why:** if the prototype is wrong, you've broken one thing not five. If replication doesn't apply cleanly to surface N, that's a smell — surface architecture isn't actually identical, surface early.

## Rule 5 — Caught-and-reverted is success, not failure
If you ship something and it breaks the user's flow, REVERT IMMEDIATELY. Don't try to patch on top. The cost of losing a session of work is way less than the cost of users hitting a broken state with funds in the vault.

When you revert: log the lesson learned. What did you assume that was wrong? Add it to `tech_learnings.md`.

## Rule 6 — Periodic consolidation
Every ~10 active sessions OR after a phase closure, distill recent session logs into universal patterns in `tech_learnings.md`. Session logs are case studies; tech_learnings is the wisdom layer.

The user can trigger this with "consolidate memory" / "do a consolidation pass". Don't re-write existing entries; just append new patterns.

## Rule 7 — State the state before changing the state
At the start of every session, read `BRAIN.md` and `TODO.md`. Verify the current version / branch / open priorities by running:
```
git log --oneline -5
git status -sb
git log origin/main..main --oneline    # what's unpushed
git diff --stat HEAD                     # what's uncommitted
grep VITE_CTGVAULT .env | grep -v '0x0\|notdeployed'   # which contracts local intends
```
State back to the user in 3-5 lines: "Current state is X. Last verified is Y. Next priority per TODO is Z." DON'T continue until the user confirms.

This catches drift from prior sessions, environment changes, or your own stale memory before it propagates into bad work.

## Rule 8 — Source-of-truth files don't drift silently
Source-of-truth files for THIS project, ranked by trustworthiness:

1. The **deployed bundle** at cyrusthegreat.dev (highest — it's what users actually run)
2. The `backup` branch at `cc2d992` (matches the deployed bundle)
3. `git log` on `main` (what's been done, even if unpushed)
4. `.env` on disk (what local code is configured to talk to)
5. `BRAIN.md` (this file — your written summary of all of the above)
6. `package.json`'s `version` field (currently `1.15.1` — out of sync with commit-message versioning `v.17.66`; **don't trust**)
7. `CURRENT_STATUS.md` (dated December 2024 — **stale, don't trust without re-verifying**)

If a downstream artifact disagrees with a higher-trust source, the downstream is wrong. Investigate.

## Rule 9 — Never cite training-data assumptions about THIS project
This project moves fast and has been renamed twice (vaultwhisper → cyrus-vault → cyrus-the-great). Verify versions, file paths, function names, deployment URLs against the current code/config — not memory. Especially when an LLM has training-data versions of the same files.

## Rule 10 — Treat private keys on disk as already-leaked-eventually
Keys in `.env` are convenient and unavoidable for dev work, but every disk write of a key extends its blast radius (Time Machine, cloud sync, IDE indexing, swap files, accidental commits, screenshare, …). Therefore:
- The keys in `cyrusthegreat/.env` are Sepolia-only by *policy*. Never use them on a chain that holds real value.
- Before any mainnet deploy, generate fresh keys and use a keystore (1Password CLI, age-encrypted file, hardware wallet via Reown).
- The `_archive/ctg_1-env-with-keys/.env` is a duplicate of `WALLET1_PRIVK`; safe to delete once you've confirmed the same key is in `cyrusthegreat/.env`.
