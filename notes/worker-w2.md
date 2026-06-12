# W2 — two-bubble overlap + insufficient banner investigation

You are W2 in a parallel sprint. This is a DIAGNOSTIC task. Code commits only if you find clean fixes.

## Two user-reported bugs

### Bug A: "Two bubbles overlap"

User: "when WLFI is in flight and I start USD1, the two bubbles we spawn are overlapping I guess I'm not sure."

I (the coordinator) read `ProgressContext.tsx` and `ProgressFlow.tsx` and don't see how two bubbles can render. The provider holds ONE session at a time; `startProgress` REPLACES it; the rendered `<ProgressFlow>` has no `key` so React reuses the same instance. Possible causes I want you to confirm or refute:
- Animation transition between expanded ↔ minimized causes a flash of two overlapping DOM elements
- Old session's DOM doesn't unmount cleanly when replaced
- User is misperceiving one element as two (e.g. backdrop + modal looking layered)
- A bug in `ProgressContext`'s state transition where both sessions render briefly

### Bug B: "Insufficient vault balance" red banner

User: "when I withdraw tokens it shows the red banner insufficient what we never had previously."

The banner is in `src/components/modals/MultiTokenWithdrawModal.tsx::validateWithdrawal` — it returns an error when `amountInSmallestUnit > balanceInSmallestUnit`. My hypothesis: this validation always existed, and the user is hitting it for the first time because commit `5b513f1` added native (ETH/BNB/etc.) to the multi-token withdraw picker — so they're now picking ETH for withdraw which they couldn't before. Possible alternatives:
- The validation logic actually changed somewhere recently and is over-firing
- The `token.balance` field is wrong/stale, causing false positives
- The inline red rendering is new (maybe was always a toast before and is now a banner)

## Approach

Read in this order:
1. `src/contexts/ProgressContext.tsx` — full file
2. `src/components/shared/ProgressFlow.tsx` — full file (focus on the expanded ↔ minimized transition and how `key`/instance identity works under session replacement)
3. `src/components/modals/MultiTokenWithdrawModal.tsx` — focus on `validateWithdrawal` and the per-row error rendering
4. `git log --oneline -p src/components/modals/MultiTokenWithdrawModal.tsx | head -200` — see when the insufficient-balance inline rendering was last touched

Then:

### For Bug A
- Build a minimal HTML test page at `notes/w2-repro-bubbles.html` that mounts two ProgressFlow sessions back-to-back (no React needed — just plain DOM with the same classes). Verify whether overlap is reproducible.
- If reproducible: identify the cause, write a fix on `src/contexts/ProgressContext.tsx` OR `src/components/shared/ProgressFlow.tsx`, separate commit per intent.
- If NOT reproducible: document what you tried and likely interpretations (animation flash, user misperception, etc.) in `notes/w2-findings.md`.

### For Bug B
- Use `git log --oneline` and `git blame` on the validation rendering. Determine: was the inline red banner always there, or did it appear recently?
- If always there: write the answer in `notes/w2-findings.md` so the coordinator can explain it to the user.
- If recently added: identify the commit, propose whether to revert/adjust, write the answer in `notes/w2-findings.md`. Commit a fix ONLY if it's a clean one-line change.

## Scope

### Files you MAY write
- `notes/w2-findings.md` (your investigation report — REQUIRED, even if no code commits)
- `notes/w2-repro-bubbles.html` (the Bug A reproduction page)

### Files you MAY edit IF a clean fix is found (ONE per commit, per Rule 1)
- `src/contexts/ProgressContext.tsx` (Bug A fix)
- `src/components/shared/ProgressFlow.tsx` (Bug A fix)
- `src/components/modals/MultiTokenWithdrawModal.tsx` (Bug B fix)

### Files you MAY NOT edit
- Anything else.

## Verification gate (if you commit a fix)

```sh
cd ~/Downloads/DEVELOPMENT/CYRUS/cyrusthegreat
source ~/.nvm/nvm.sh && nvm use 22.19.0
npx tsc --noEmit
npx vite build
```

## Branch

```sh
git fetch origin main
git checkout main && git pull origin main
git checkout -b worker/w2-bug-investigation
```

## Commit format

Always one findings commit first:
```
docs(investigation): two-bubble overlap + insufficient-banner findings

[Bug A summary: reproducible Y/N, cause if Y, hypothesis if N]
[Bug B summary: when the validation was added, whether it's correct]
```

Optional fix commit(s) after, one per intent:
```
fix(progress-modal): <specific intent for Bug A fix>
```
or
```
fix(multi-token-withdraw): <specific intent for Bug B fix>
```

## When done

- Push `worker/w2-bug-investigation` to origin.
- Do NOT open a PR. Do NOT merge into main.
- Coordinator session reviews `notes/w2-findings.md` and decides next steps.
