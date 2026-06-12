# Sprint checkpoint — 2026-06-11

## State of main
Currently at `5bc7055` (form-reset fix). All deployed via Cloudflare auto-build on push to main. 0 unpushed.

## What shipped this sprint (chronological highlights)
- Multi-token batch as ONE atomic tx — dropped legacy ETH-split frontend code (`8bc8a0c`)
- Real on-chain receipt-wait before ✓ on every flow (multi-token `5c9e64c`, single-asset `003560b`)
- 3-step lifecycle (Sign → Confirm → Finalize) across all 6 production flows
- Imperial Gold ProgressFlow modal skin (debug `a70d8da`, production `ec4d412`)
- Locale-tolerant amount inputs — US `1,234.56` / EU `0,1` / FR `1 234,56` (`e860c6d`)
- Approval default flipped: `amount + 10%` is default; `MAX_UINT256` is per-token opt-in (`2d69f0a`)
- Cross-modal isolation: dropped `progressActive` lock (`bfdd7d3`), dropped `isLoading` from disabled checks + killed auto-close-all-on-confirm (`273328e`)
- Concurrent tx fix: switched single-asset hooks from `useWriteContract().writeContractAsync` (shared mutation, races on concurrent calls) to `writeContract(config, …)` from `@wagmi/core` (independent action) (`9ac3790`)
- Form-state reset on modal open — modal stays mounted, useState doesn't reset on its own (`5bc7055`)
- Debug UI single-asset tests (b8-3 / b8-5 / b8-6 / b8-9 / b8-10) ported to 3-step lifecycle (`c257765`)

## Open / unverified — these become worker tasks
1. **`approve+deposit` legacy state machine** — `executeTokenApprovalAndDeposit` in `src/hooks/useVault.ts` still uses a `setTimeout(…, 3000)` race + `pendingApprovalForDeposit` state to chain the approve and deposit txs. Doesn't drive the App-level ProgressFlow popup. Debug UI b8-8 shows the target pattern (Approve → Sign → Confirm → Finalize).
2. **Two-bubble overlap (user-reported)** — user says ProgressFlow shows "two bubbles overlapping" during certain transitions between WLFI and USD1 sessions. Unreproduced in code review; ProgressContext is single-session.
3. **"Insufficient vault balance" red banner (user-reported)** — user thinks this is new behavior in `MultiTokenWithdrawModal.validateWithdrawal`. Hypothesis: it's correct validation, surfaced for the first time after `5b513f1` (which added native to the multi-token withdraw picker), but needs verification.

## Worker assignments

| Worker | Branch | Brief | Files allowed |
|---|---|---|---|
| **W1** | `worker/w1-approve-deposit` | `notes/worker-w1.md` | `src/hooks/useVault.ts` ONLY |
| **W2** | `worker/w2-bug-investigation` | `notes/worker-w2.md` | Read-only diagnosis; may edit `src/contexts/ProgressContext.tsx`, `src/components/shared/ProgressFlow.tsx`, or `src/components/modals/MultiTokenWithdrawModal.tsx` IF a clean fix is found. Writes findings to `notes/w2-findings.md`. |

## Process rules workers MUST follow

Stricter than baseline `workflow_rules.md` — these are reactions to a recent debugging fiasco where I patched symptoms across 5 commits before finding the root cause was that `useWriteContract` is a shared react-query mutation. Should have been 1-2 commits if I'd read the wagmi source first.

1. **Read source first.** For W1, read `executeTokenApprovalAndDeposit` AND `executeTokenDeposit` end-to-end before writing any code. For W2, read `ProgressContext` + `ProgressFlow` + the validation function end-to-end.
2. **Write your diagnosis in the commit message body.** Not the title — the body. Make it a paragraph someone reading `git log -p` could understand cold.
3. **ONE COMMIT PER INTENT.** If mid-work you discover a second intent, STOP, commit what's done, write a `notes/worker-wN-followup.md` describing the second intent, exit. Don't pile follow-ups on top.
4. **Don't push to main.** Push your own branch ONLY. The coordinator session integrates.
5. **Verification gate before commit**: `npx tsc --noEmit` clean AND `npx vite build` clean. If either fails, fix or revert before committing.

## Merge protocol

Each worker commits + pushes its branch. Coordinator session (the one that spawned the workers) reviews each branch and does the final integration onto main. Workers do NOT touch main and do NOT merge themselves.

## Reference surfaces (debug UI is canonical per `workflow_rules.md` Rule 4)
- `tools/contract-debug/index.html` test `b8-8` — target pattern for W1 (Approve → Sign → Confirm → Finalize)
- `b8-4` / `b8-7` / `b8-11` — already-correct multi-token references

## Deployed surfaces
- Bank8 (regular vault) — all 5 testnets
- CyrusTresor1 (v2 anonymity pool — Bank8 + commit-reveal layer) — all 5 testnets; live on cyrusthegreat.dev behind `VITE_ENABLE_POOL=true`

## Decay note
Re-read this if more than ~2 weeks have passed; new surfaces (CyrusTresor1 polish, Solana scaffold) may have shifted state significantly by then.
