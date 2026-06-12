# W2 findings — 2026-06-12

Scope: investigate two user-reported bugs.
- Bug A: "two bubbles overlapping" during WLFI → USD1 transitions.
- Bug B: "insufficient vault balance" red banner the user thinks is new.

Diagnostic-first. No code commits — reasons below.

---

## Bug A — two-bubble overlap

### TL;DR
**Not reproducible from `ProgressContext` + `ProgressFlow` alone.** A single
`ProgressFlow` instance is rendered by `ProgressProvider`; calling
`startProgress` a second time only replaces the `session` state on the
existing instance — React diffs the same DOM node, no second overlay is
ever mounted. See `notes/w2-repro-bubbles.html`'s "Replace mode" to verify.

If the user is seeing two overlapping cards, the most likely real cause is
**Radix Dialog close animation overlapping with ProgressFlow open animation**
(addressed under "Plausible real causes" below). Confirming that requires
DOM inspection in the live app on the exact transition the user described,
not code reading alone.

### Code-path read

- `src/App.tsx:26` — exactly one `<ProgressProvider>` mounted.
- `src/contexts/ProgressContext.tsx:127–136` — provider renders one
  `<ProgressFlow>` JSX node, gated only on `session !== null`.
- `src/contexts/ProgressContext.tsx:73–79` — `startProgress` calls
  `setSession({ id, … })` and `setExpanded(true)`. Both are batched in
  React 18, so the transition between session A and session B is atomic
  in a single render. The same `<ProgressFlow>` instance is reused (no
  `key`, no conditional unmount because `session` never becomes `null`
  during the swap).
- `src/contexts/ProgressContext.tsx:81–92` — `updateProgress` is
  id-guarded by `liveIdRef`; a background flow whose session was already
  replaced is silently dropped, so the prior session can't repaint into
  the live overlay.
- `src/components/shared/ProgressFlow.tsx:225–230` — single root
  `.pf-overlay` div. The `.pf-mini` and `.pf-progress-body` divs are both
  always in the DOM, gated by CSS `display` based on the `.minimized`
  class; only one is visible at a time.
- No other `<ProgressFlow>` mount-points anywhere in `src/` — `grep -rn`
  confirms only the one in `ProgressContext.tsx:128`. None inside any
  modal, none nested.

### Repro page
`notes/w2-repro-bubbles.html` mounts the same DOM structure plain (no
React). Buttons:
- **Replace mode** (production semantics) — calling startProgress twice
  produces exactly one overlay on screen at any time, including across
  expanded → minimized → expanded transitions. No flash, no overlap.
- **Append mode** (broken-for-contrast) — if startProgress *forgot* to
  remove the prior overlay and instead appended a new one, you would see
  stacked bubbles. This is what the bug *would* look like; the codebase
  doesn't do this.

### Plausible real causes (not addressable inside W2's file scope)

1. **Radix DialogContent close-animation overlapping ProgressFlow
   open-animation.** Sequence: WLFI ProgressFlow is in flight (centered
   modal). User opens single-asset Deposit modal for USD1 — that's a
   Radix `<Dialog>` whose `DialogContent` mounts centered. User clicks
   "Deposit"; the modal's submit handler does roughly
   `startProgress(...); onCommitted(); onOpenChange(false)`. The Radix
   Dialog runs its `data-state="closed"` animation (translate + scale
   + opacity) over ~150ms, during which the closing DepositModal card
   AND the freshly-opening (or freshly-replaced) ProgressFlow card are
   both centered on screen. To a user that's "two bubbles overlapping."
   *Fix would live in `DepositModal.tsx` / `WithdrawModal.tsx` etc. —
   outside W2's allowed file set.*

2. **Expanded ↔ minimized transition perception.** When the user hides
   WLFI to the corner chip then triggers USD1, `startProgress` resets
   `expanded = true`, so the chip's `.minimized` class is removed and
   the same overlay morphs from corner chip → centered modal in one
   tick. Because the `.pf-modal` element's keyframe animations
   (`pfPopIn`, `pfFadeIn`) are `forwards` and only fire on element
   mount, the visual is a smooth CSS transition rather than two
   independent elements — but the morph IS visible. If the user
   glanced away mid-morph, "two bubbles" is a reasonable misperception
   of one element moving + resizing across the viewport.

3. **React 18 strict-mode double-invoke (dev-only).** If the user is
   running `npm run dev` against a `<StrictMode>`-wrapped tree, effects
   double-fire. Doesn't double-render DOM in prod and shouldn't be
   visible — but worth ruling out.

### Recommendation
**Don't ship a speculative `ProgressContext`/`ProgressFlow` change.**
The single-session invariant is mathematically tight; introducing a fix
risks regressing the cross-modal isolation that just landed in `bfdd7d3`
and `273328e`. Ask the user for:
- A screen recording of the exact WLFI → USD1 sequence that produces it.
- DevTools elements snapshot during the overlap — count `.pf-overlay`
  nodes. If there's only one, this is cause (1) or (2). If there are
  two, the bug is real and we need the repro steps.

---

## Bug B — "insufficient vault balance" red banner

### TL;DR
**The validation + inline red banner have existed since the file's
first commit (`2aff1e4`, 2025-08-23, v1.17.6).** The user is hitting it
for the first time because commit `5b513f1` (2026-06-09) added native
(ETH/BNB/HYPE/…) to the multi-token withdraw picker, AND the validation
fires correctly when the user picks a native they don't actually have
in the vault. The previous picker excluded native via an explicit
`token.address !== '0x0…'` filter, so the user could never trigger this
branch with native before.

### Code-path read

`src/components/modals/MultiTokenWithdrawModal.tsx:128–130`:

```ts
if (amountInSmallestUnit > balanceInSmallestUnit) {
  return { isValid: false,
           error: `Insufficient vault balance. Max: ${formatTokenBalance(token.balance, token.decimals)}` };
}
```

The inline rendering of `withdrawal.error` (the red banner with the
`AlertTriangle` icon) is at
`src/components/modals/MultiTokenWithdrawModal.tsx:300–305`.

### Git archaeology

| Commit | Date | What changed |
|---|---|---|
| `2aff1e4` (v1.17.6) | 2025-08-23 | File created; inline red banner + "Insufficient vault balance" string present from day 1 |
| `01f8d38` (v1.17.27) | 2025-08-27 | Switched validation from `parseFloat`-comparison to BigInt comparison; string unchanged |
| `be774c2` (v.1.17.56) | 2025-08-28 | Switched comparison to `convertToWei(…)` (decimal.js precision); string unchanged |
| `eb421af` (v1.17.33) | 2025-08-27 | `formatBalance` → `formatTokenBalance` rename for the error message; string and behavior unchanged |
| `5b513f1` | 2026-06-09 | Removed `token.address !== '0x0…'` filter from the picker — first time native is selectable in multi-token withdraw |

So the validation logic and rendering have been live for ~10 months. What
changed recently is *which token universe the user can pick from*.

### Why the banner now fires for the user

The relevant trigger condition is when `token.balance === "0"`.
`convertToWei("0", _) === 0n` (see `src/lib/utils.ts:49–51` short-circuit).
Any user-typed amount > 0 produces `amountInSmallestUnit > 0`, so the
comparison fires and the inline banner appears with "Max: 0".

For pre-5b513f1 behavior: the multi-token withdraw picker filtered out
`0x0…` (native), so the user could only pick ERC-20s. ERC-20s that show
up in the picker were typically ones the user had a positive vault
balance for, so the 0-balance trigger almost never fired. After
5b513f1, native is unconditionally added (`Index.tsx:121–123` builds
`vaultTokensWithNative = vaultNativeToken ? [vaultNativeToken, ...vaultTokens] : vaultTokens`)
even when `vaultBalanceData === 0n`. A user who has never deposited
native into the vault now sees native as a pickable card with
"0 available", picks it, types an amount, and the banner correctly
fires.

That matches the user's "we never had previously" — not because the
banner is new, but because the *path to hitting it* is new.

### Secondary bug surfaced (NOT in W2 scope, NOT being fixed)

While reading the validation, I noticed it's mathematically broken for
non-zero balances:

```ts
const amountInSmallestUnit = convertToWei(amount, token.decimals);      // e.g. "1.5" → 1.5e18
const balanceInSmallestUnit = convertToWei(token.balance, token.decimals);  // token.balance IS raw wei → 1.5e18 * 1e18 = 1.5e36
```

`token.balance` is stored as the raw-wei string throughout the codebase
(see `src/hooks/useVault.ts:626` `humanBalance = bigIntToFullPrecisionString(tokenBalance)`,
`useVault.ts:935` `walletBalance.value.toString()`, `useVault.ts:944`
`(vaultBalanceData as bigint).toString()`, `useVault.ts:1180` for wallet
ERC-20s). But `validateWithdrawal` passes that raw-wei string into
`convertToWei`, which multiplies by `10 ** decimals` *again*. Result:
the balance gets inflated by `10 ** decimals`, so the inequality
`amountInSmallestUnit > balanceInSmallestUnit` virtually never fires for
typed-human amounts.

The 0-balance case still fires correctly only because of the
`amountStr === '0'` short-circuit in `convertToWei`. For any non-zero
balance, the check is effectively dead — the contract is the real
gatekeeper for overdrafts.

Same pattern (and same bug) exists in:
- `src/components/modals/MultiTokenWithdrawModal.tsx:125–129`
- `src/components/modals/MultiTokenTransferModal.tsx` (`Insufficient vault balance` line)
- `src/components/modals/MultiTokenDepositModal.tsx:136–140`

Was likely correct at v1.17.27 (the comparison was introduced when
`token.balance` was still a human-decimal string); broke silently when
balance storage flipped to raw wei in v1.17.28 (`a43b859`,
2025-08-28). The migration updated balance storage everywhere but
didn't revisit the modal validators.

**Why I'm not fixing this here:**
1. The user's reported complaint is the banner *firing*, not failing
   to fire. The 0-balance trigger they're hitting is itself correct
   UX (you can't withdraw something you don't have). Fixing the
   non-zero path doesn't make the user-visible behavior different in
   the cases they're complaining about — they'd still see the banner.
2. Fixing it correctly would touch three modal files (Deposit /
   Withdraw / Transfer). W2's brief allows only
   `MultiTokenWithdrawModal.tsx` for code commits, and W2 sprint rules
   require *one intent per commit*. The fix should be a separate
   sprint task spanning all three.
3. A correct fix needs to decide: do we change `validateWithdrawal`
   to expect raw-wei balance (one-line change: `convertToWei(amount,
   decimals) > BigInt(token.balance)`), or do we change all callers
   to pass decimal-form balance? The former is much smaller; the
   latter is more invasive. Coordinator should pick.

### Recommendation
Tell the user the banner is correct, not new. If the user reports it
firing on a non-zero balance, that's a different bug — request the
specific token + balance + amount that triggered it, because the
current code can only trigger inline for 0-balance picks.

Spin off a follow-up task to fix the dead-comparison bug across
Deposit / Withdraw / Transfer multi-token modals. Suggested patch
shape per file:

```ts
- const balanceInSmallestUnit = convertToWei(token.balance, token.decimals);
+ const balanceInSmallestUnit = BigInt(token.balance);
```

(Assumes the upstream invariant — `token.balance` is always raw-wei
string — holds. It currently does, confirmed via `useVault.ts` reads.)

---

## Files touched in this investigation

- **Read-only**: `src/contexts/ProgressContext.tsx`,
  `src/components/shared/ProgressFlow.tsx`,
  `src/components/modals/MultiTokenWithdrawModal.tsx`,
  `src/components/modals/MultiTokenDepositModal.tsx` (cross-check),
  `src/components/modals/WithdrawModal.tsx` (data flow), `src/App.tsx`,
  `src/pages/Index.tsx`, `src/hooks/useVault.ts`, `src/lib/utils.ts`.
- **Wrote**: `notes/w2-findings.md` (this file),
  `notes/w2-repro-bubbles.html` (the Bug A repro page).
- **No source edits.**

## What did not get committed and why
- No `ProgressContext.tsx` / `ProgressFlow.tsx` change — Bug A
  isn't reproducible from those files alone; speculative fix would
  risk regressing recent cross-modal-isolation work.
- No `MultiTokenWithdrawModal.tsx` change — Bug B's user-visible
  banner *is* correct in the 0-balance trigger they're hitting; the
  deeper validation-dead-on-non-zero bug is out of W2 scope (touches
  three modals, needs coordinator design decision).
