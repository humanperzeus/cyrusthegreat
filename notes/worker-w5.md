# W5 — revive the multi-session ProgressFlow (stacked chips)

You are W5 in the cyrusthegreat sprint. Read this whole brief BEFORE
touching code. Self-contained — don't assume context from prior workers.

## What the user wants

Right now `ProgressContext` allows ONE in-flight session at a time. If
the user fires Tx A and then Tx B before A finishes (e.g. multi-token
deposit on Sepolia + a single-asset transfer on Base), B's
`startProgress` REPLACES A — they lose visibility into A entirely. Only
one popup/chip ever shows.

The user wants **stacked chips** — DEX-style. Multiple concurrent
sessions each get their own chip in the bottom-right corner, stacked
vertically. At most ONE chip is "expanded" (centered modal) at a time;
clicking another chip swaps the expanded session. Starting a new
session auto-expands it (the just-clicked action is what the user is
watching), so the previously-expanded one minimizes to a chip.

Direct user quotes from this sprint:
- "i only see always 1 but we should actually have like 3-4 if we have
  multiple things running i cannot see them running it seems as we
  always only show one."
- "i want B — stacked chips" (in response to a Pattern A / Pattern B
  mockup widget where B was the stacked-chip option).

## CRITICAL prior art: commit 397fa50

This refactor was ALREADY built and then walked back. Commit hash:
`397fa50201d3bd356ffae62c0c4170daca1768a4`. Read it first:

```sh
cd ~/Downloads/DEVELOPMENT/CYRUS/cyrusthegreat
git show 397fa50 --stat
git show 397fa50 -- src/contexts/ProgressContext.tsx
git show 397fa50 -- src/components/shared/ProgressFlow.tsx
```

That commit gives you the WHOLE design (session array, per-id update,
chip stacking, terminal auto-close, body-scroll-lock ownership,
ProgressFlow controlled `expanded` prop, `chipIndex` offset). DO NOT
reinvent it — start from that diff. Your job is to revive it AND make
it coexist with two things that have landed since:

### Coexist with the W4 chip-during-close pattern (must NOT regress)

After 397fa50 was walked back, the W4 worker fixed the "two cards
overlapping" bug by having every submit handler:

```ts
const sessionId = startProgress(title, [...]);
setProgressExpanded(false);             // start as chip
onOpenChange(false);                    // Radix runs its 200ms close
setTimeout(() => setProgressExpanded(true), 250);  // re-expand
```

This pattern is currently in ALL 6 modal submit handlers AND
WithdrawModal's `handleSubmit` (the Bug 1 fix from commit `8269ec9`).

The 397fa50 commit's API was `expandProgress(id | null)`. The current
API is `setProgressExpanded(boolean)`. In multi-session world,
"setProgressExpanded(true)" is ambiguous (which session?), so port the
397fa50 API and rewrite every call site:

| Old (current)                       | New (multi-session)              |
|-------------------------------------|----------------------------------|
| `setProgressExpanded(false)`        | `expandProgress(null)`           |
| `setProgressExpanded(true)` w/id S  | `expandProgress(sessionId)`      |

The W4 chip-flash-then-expand timing (0ms collapse + 250ms re-expand)
MUST still work for every submit site after the rewrite.

### Coexist with Bug 1's WithdrawModal form-routing fix

Commit `8269ec9` (the immediately preceding commit on main) made
`WithdrawModal.handleSubmit` route via `isTokenWithdraw`. Don't undo
that — preserve the routing branch, just swap the
`setProgressExpanded` calls for the new `expandProgress` API.

## Files you may touch

The 5 files 397fa50 touched, PLUS the 3 single-asset modals (which
also need to migrate to the new API since the W4 chip pattern is in
all 6 now, not just the multi-X modals like in 397fa50):

- `src/contexts/ProgressContext.tsx` — full rewrite per 397fa50 baseline
- `src/components/shared/ProgressFlow.tsx` — controlled `expanded`,
  add `chipIndex` for stack offset
- `src/components/modals/MultiTokenDepositModal.tsx`
- `src/components/modals/MultiTokenWithdrawModal.tsx`
- `src/components/modals/MultiTokenTransferModal.tsx`
- `src/components/modals/DepositModal.tsx` — migrate setProgressExpanded
  calls at the button-click submit handler
- `src/components/modals/WithdrawModal.tsx` — migrate setProgressExpanded
  calls at BOTH the button-click submit (~:258) AND `handleSubmit` (~:111)
- `src/components/modals/TransferModal.tsx` — migrate setProgressExpanded
  calls at the button-click submit AND `handleSubmit`

Out of scope (don't touch):
- `src/hooks/useVault.ts`
- `src/pages/Index.tsx`
- Any other modal or page
- The toast suppression flags (all stay false)

## Behavior specification (re-stating from 397fa50)

- **Session array** — `sessions: ProgressSession[]`, each with
  `{ id, title, steps, terminalAt: number | null }`.
- **Single expanded** — at most one session in the array has
  `expanded === true`. Provider state stores `expandedId: string | null`.
- **Start** — `startProgress(title, initialSteps)` appends a new session
  and sets it as `expandedId`. Returns the new id.
- **Update** — `updateProgress(id, steps)` updates the session whose
  `id` matches; if no session has that id (already closed), no-op.
  Latches `terminalAt = Date.now()` the first time the session reaches
  terminal (all done OR any failed). Later detail edits must NOT
  restart the auto-close clock.
- **Expand** — `expandProgress(id | null)` sets `expandedId`. Passing
  `null` collapses everything to chips. Passing an id that doesn't
  exist is a no-op (don't throw).
- **Close** — `closeProgress(id)` removes that session from the array.
  If it was the expanded one, `expandedId` becomes null.
- **Auto-close** — every 2s, drop any session whose
  `terminalAt !== null && Date.now() - terminalAt > 30_000`.
- **active** — `true` if ANY session in the array has `terminalAt === null`.
  (Multi-X modals use this to disable their submit buttons — but each
  modal disables based on global active, NOT a per-session lock. Keep
  the existing semantics.)
- **Body scroll lock** — provider-owned. Lock body overflow if and only
  if there exists a session AND `expandedId !== null`. This guarantees
  no race on document.body.overflow across multiple ProgressFlow
  instances.

## Chip stacking layout

ProgressFlow takes a `chipIndex: number` prop. When the session is
NOT expanded, the chip renders in the bottom-right corner with:
- `right: 16px` (or current value — preserve)
- `bottom: 16px + chipIndex * 64px`

`chipIndex` is computed by the provider as the index of this session
within the array of NON-expanded sessions, with most-recent first
(`chipIndex === 0` is the bottom one). The expanded session doesn't
participate in stack offset (it's centered).

If the array has only one session and it's expanded, no chips render.
If the array has one expanded + one chip, the chip is at
`bottom: 16px`.

## Diagnosis-first commit body

Per Workflow Rule 3 (diagnose-before-fix), your commit body MUST
contain:
1. Confirmation you read commit 397fa50 and what you took from it
   verbatim vs what you adjusted for the W4 coexistence.
2. The API rename table (setProgressExpanded → expandProgress).
3. List of every call site you migrated (grep
   `setProgressExpanded\|startProgress` in the modal files).
4. How you verified the W4 chip-during-close still works AFTER the
   rewrite (specifically, the 0ms collapse + 250ms re-expand timing
   for every submit handler still produces the correct visual sequence:
   dialog closes → no overlap → session expands at 250ms).

## Verification gate

```sh
cd ~/Downloads/DEVELOPMENT/CYRUS/cyrusthegreat
source ~/.nvm/nvm.sh && nvm use 22.19.0
npx tsc --noEmit         # must be clean
npx vite build           # must succeed
```

Plus a manual-trace section in the commit body confirming:
- Two concurrent multi-token deposits show two chips, expanded one swaps
  when you click the minimized one.
- Starting a third session while two are running: array has three,
  third becomes expanded, first two are chips at indices 1 and 0.
- Closing a chip (X button) removes only that session.
- Terminal session auto-closes 30s after going terminal.

## Workflow rules in force

- **Rule 1**: ONE intent per commit. This whole refactor is ONE intent
  ("multi-session ProgressFlow"). ONE commit.
- **Rule 3**: Diagnose-before-fix. Body must show you read 397fa50.
- **Rule 4**: Debug UI (`/debug` route) is the canonical reference
  surface. Manually drive a multi-X deposit followed by a single-asset
  withdraw and confirm both chips appear.

## Branch

```sh
git fetch origin main
git checkout main && git pull origin main
git checkout -b worker/w5-multi-session-chips
```

## When done

- Push `worker/w5-multi-session-chips` to origin. Do NOT merge to main.
- Do NOT open a PR.
- Coordinator (parent session) cherry-picks.
