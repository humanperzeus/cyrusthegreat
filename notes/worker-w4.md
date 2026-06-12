# W4 — investigate + fix the cross-modal animation overlap

You are W4 in a parallel sprint. Read this whole brief before touching code.

## The user report

When a single-asset deposit/withdraw/transfer is committing, the user sees "two bubbles overlapping" — the closing dialog and the opening ProgressFlow are both centered on the page at the same time.

## Critical prior reading (DO THIS FIRST)

`notes/w2-findings.md` — Bug A section, especially "Plausible real causes" #1. W2 ruled out a real ProgressFlow bug and identified the most-likely cause: **Radix `DialogContent` close-animation (`data-state="closed"`, ~150ms) overlapping ProgressFlow's open-animation**. The submit handler in the 3 single-asset modals roughly does:

```ts
const sessionId = startProgress(...);  // opens ProgressFlow centered, expanded
onOpenChange(false);                   // Radix begins close-animation on DialogContent
onDeposit(...);                        // fires the actual write
```

`startProgress` mounts the ProgressFlow popup synchronously, but `onOpenChange(false)` triggers Radix's exit animation rather than an immediate unmount. For ~150ms, BOTH the closing DepositModal/WithdrawModal/TransferModal card AND the just-opened ProgressFlow card are visible centered.

W2 didn't fix it because the fix is outside W2's allowed file set.

`notes/w2-repro-bubbles.html` — W2's repro page. Shows the production semantics (single overlay) and a contrasting "append mode" so you can see what stacked bubbles would look like. **Extend it with a "Radix-close-overlap simulation" mode** (see Diagnostic section below).

## Diagnostic you MUST produce before any code change

1. **Read all six modal submit handlers** end-to-end (single-asset: `DepositModal`, `WithdrawModal`, `TransferModal`; multi-X: `MultiTokenDepositModal`, `MultiTokenWithdrawModal`, `MultiTokenTransferModal`). Confirm the order of operations: `startProgress` → `onOpenChange(false)` (or `onCommitted()` for multi-X) → call into the deposit hook.
2. **Read `src/components/ui/dialog.tsx`** (shadcn's Radix wrapper). Confirm:
   - Whether `DialogContent` has a CSS exit animation (look for `data-[state=closed]:animate-out` or similar Tailwind classes).
   - How long that animation runs (look for `duration-NNN` classes).
   - Whether `forceMount` or `unmount on close` is the default.
3. **Extend `notes/w2-repro-bubbles.html`** with a new mode that simulates the real-world timing: open a fake Radix-style dialog with its closing animation timed at the same duration the real one uses, AND open a ProgressFlow at the same instant. Verify the overlap IS reproducible in the page. If the overlap reproduces here, the cause is confirmed; if it doesn't, dig further.

Write your conclusions in the commit message body.

## Fix candidates (pick one — the LEAST invasive that works)

Listed in order of increasing invasiveness:

**A. Open the ProgressFlow as a chip first, then expand once the dialog has finished closing.**
In the 6 modal submit handlers, call `startProgress(...)` then immediately `expandProgress(null)` (collapse to chip), then a `setTimeout(() => expandProgress(sessionId), 200)` to re-expand after Radix is done. Pros: surgical, no Radix wrestling. Cons: a tiny initial chip flash; adds a setTimeout that future-you will hate.

**B. Hide the Radix dialog's exit animation when committing.**
Pass `forceMount={false}` (or whatever the equivalent is) when the modal closes via the submit path vs the cancel path. Could be done by tracking a `committing` ref in each modal and conditionally rendering the DialogContent. Pros: no animation overlap, no chip flash. Cons: bigger touch; introduces a new branch in every modal.

**C. Delay startProgress until the dialog is fully unmounted.**
In each submit handler, set a state flag, return early; in a useEffect watching `open === false`, fire the real startProgress. Pros: cleanest semantically (the popup truly opens after the dialog closes). Cons: 6 modals, 6 effects, easy to get wrong; introduces an ordering dependency.

**D. CSS-only: shorten or remove the Radix close animation globally for committed submits.**
Add a class to the modal's DialogContent during commit that overrides the exit animation duration to 0. Pros: tiny CSS change. Cons: needs to find the right Tailwind override.

**Default recommendation if confirmed**: **A** is the simplest verifiable fix. Use it unless you find a structural reason it won't work.

If your investigation finds the cause is NOT what W2 hypothesized (e.g. the timing isn't actually overlapping in the real app, or the dialog already unmounts instantly), STOP and write `notes/w4-findings.md` instead of shipping a fix. Don't ship a fix for a bug that doesn't exist.

## Scope

### Files you MAY edit
- The 3 single-asset modal files:
  - `src/components/modals/DepositModal.tsx`
  - `src/components/modals/WithdrawModal.tsx`
  - `src/components/modals/TransferModal.tsx`
- The 3 multi-X sub-modal files (only if your investigation shows the same overlap there):
  - `src/components/modals/MultiTokenDepositModal.tsx`
  - `src/components/modals/MultiTokenWithdrawModal.tsx`
  - `src/components/modals/MultiTokenTransferModal.tsx`
- `src/contexts/ProgressContext.tsx` (only if fix candidate A is chosen — needs an `expandProgress(null)` followed by re-expand pattern, which might be cleaner as a new context method)
- `notes/w2-repro-bubbles.html` — extend with the new Radix-close-overlap simulation
- `notes/w4-findings.md` — if you DON'T ship a fix, write this instead

### Files you MAY NOT edit
- `src/components/shared/ProgressFlow.tsx` — single-component, well-tested; don't touch
- `src/components/ui/dialog.tsx` — shadcn primitive, don't customize globally
- `src/hooks/useVault.ts` — out of scope
- Anything else not listed above

## Verification gate

```sh
cd ~/Downloads/DEVELOPMENT/CYRUS/cyrusthegreat
source ~/.nvm/nvm.sh && nvm use 22.19.0
npx tsc --noEmit         # must be clean
npx vite build           # must succeed
```

**AND** the extended `notes/w2-repro-bubbles.html` must show:
- The "Radix-close-overlap simulation" mode reproduces the overlap WITHOUT the fix
- The same mode shows NO overlap WITH the fix applied (gate the fix behind a checkbox in the repro page so you can A/B compare)

## Branch

```sh
git fetch origin main
git checkout main && git pull origin main
git checkout -b worker/w4-overlap-fix
```

## Commit format

ONE commit if shipping a fix. Title:

```
fix(modals): close parent dialog instantly when committing so ProgressFlow doesn't overlap
```

(Adjust title if you pick a different fix candidate.)

Body must contain:
- Diagnosis: which fix candidate you picked and WHY (citing the dialog animation duration you found in step 2 of the diagnostic).
- Confirmation that the overlap reproduces in the extended repro page WITHOUT the fix and disappears WITH it.
- A note on which 6 modals were updated (or fewer if multi-X doesn't have the same issue).

If you don't ship a fix because your investigation contradicts the W2 hypothesis: ONE commit with just the extended repro page + `notes/w4-findings.md`. Title:

```
docs(investigation): cross-modal overlap not reproducible — findings
```

## When done

- Push `worker/w4-overlap-fix` to origin. Don't merge to main.
- Don't open a PR.
- Coordinator integrates.
