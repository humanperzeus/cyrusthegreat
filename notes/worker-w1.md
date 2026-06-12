# W1 — approve+deposit refactor

You are W1 in a parallel sprint. Read this whole brief before touching code.

## Goal

First-time token deposit (when `allowance < requiredAmount`) currently goes through `executeTokenApprovalAndDeposit` in `src/hooks/useVault.ts`. That function:

- Uses `setTimeout(…, 3000)` between approve and deposit
- Uses `pendingApprovalForDeposit` state + a `useEffect` to bridge the two txs
- Does NOT drive the App-level `ProgressFlow` popup — user gets only toasts during first-time approval

The already-approved path (`executeTokenDeposit`) does the right thing: uses `writeContract(config, …)` from `@wagmi/core`, calls `waitForTransactionReceipt`, drives the lifecycle helper, calls `refreshAfterTx()` at the end. Mirror that, but with a 4-step lifecycle so the approve is its own step.

## Target lifecycle (4 steps)

```
Approve TOKEN → Sign in wallet → Confirm on-chain → Finalize & refresh
```

The pattern already exists in `tools/contract-debug/index.html` test `b8-8` (search for `id: "b8-8"`). Mirror it exactly.

## Scope

### Files you MAY edit
- `src/hooks/useVault.ts` — specifically:
  - `executeTokenApprovalAndDeposit` (rewrite to the 4-step lifecycle)
  - `pendingApprovalForDeposit` state + the `useEffect` that auto-fires the deposit after approval confirms (DELETE both)
  - `depositTokenSmartWagmi` — its call into the approval branch may need to forward `onProgress`

### Files you MAY NOT edit
- Anything outside `src/hooks/useVault.ts`. If you find yourself wanting to touch another file, **STOP**, commit what's done, write `notes/worker-w1-followup.md` describing the second intent, exit.

## Diagnosis you MUST write before any code

Read `executeTokenApprovalAndDeposit` AND `executeTokenDeposit` AND `depositTokenSmartWagmi` end-to-end first. Then in your commit message body, answer:

1. Why does the legacy code use `setTimeout(3000)`? What concrete problem was it solving?
2. Why does it use `pendingApprovalForDeposit` state + useEffect instead of just chaining promises?
3. What are the failure modes of the current code? (user rejects approval, approval reverts, approval hangs, the 3-second timer fires before approval confirms, etc.)
4. How does your refactor handle each of those failure modes?

If you can't answer any of these from reading the source, ask via a followup note file before writing code.

## Verification gate (must pass before commit)

```sh
cd ~/Downloads/DEVELOPMENT/CYRUS/cyrusthegreat
source ~/.nvm/nvm.sh && nvm use 22.19.0
npx tsc --noEmit         # must be clean
npx vite build           # must succeed
# Bundle check: pendingApprovalForDeposit should be gone
grep -c 'pendingApprovalForDeposit' dist/assets/index-*.js
# Should return 0 (the identifier is deleted, minifier won't preserve a dead name)
```

If `tsc` or `vite build` fails, fix the issue or revert your changes. Do NOT commit a broken build.

## Branch

```sh
git fetch origin main
git checkout main && git pull origin main
git checkout -b worker/w1-approve-deposit
# … do work …
git add src/hooks/useVault.ts
git commit -m "..."     # see commit format below
git push -u origin worker/w1-approve-deposit
```

## Commit format

ONE commit. No more. Title and body:

```
refactor(useVault): approve+deposit uses 4-step lifecycle, no setTimeout race

[Diagnosis paragraph: answers to the 4 questions above]

[Implementation summary: which functions changed, which state was deleted,
which @wagmi/core functions replaced the hook variants]

[Failure mode coverage: how user-rejection, approval-revert, approval-hang
are each handled by the new code]
```

## When done

- Push to `worker/w1-approve-deposit` only.
- Do NOT open a PR. Do NOT merge into main. The coordinator session integrates.
- If you wrote `notes/worker-w1-followup.md`, mention it in your commit message body.
