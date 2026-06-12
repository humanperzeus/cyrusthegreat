# W3 — fix convertToWei double-multiplication in multi-token validators

You are W3 in a parallel sprint. Read this whole brief before touching code.

## The bug (already diagnosed by W2 — see `notes/w2-findings.md` for the long version)

Three multi-token modals validate user-typed amounts against `token.balance`:

- `src/components/modals/MultiTokenWithdrawModal.tsx::validateWithdrawal`
- `src/components/modals/MultiTokenDepositModal.tsx::validateDeposit`
- `src/components/modals/MultiTokenTransferModal.tsx::validateTransfer`

Each one does:
```ts
const amountInSmallestUnit  = convertToWei(amount,         token.decimals);  // correct — amount is human "1.5"
const balanceInSmallestUnit = convertToWei(token.balance,  token.decimals);  // BUG — token.balance is raw wei
if (amountInSmallestUnit > balanceInSmallestUnit) { /* insufficient */ }
```

`token.balance` has been stored as the raw-wei string throughout `useVault.ts` since v1.17.28 (commit `a43b859`, 2025-08-28). Sources confirmed by W2:
- `src/hooks/useVault.ts:626` (vault ERC-20s — `humanBalance = bigIntToFullPrecisionString(tokenBalance)`)
- `src/hooks/useVault.ts:935` / `useVault.ts:944` (wallet/vault native — `.toString()` on the raw bigint)
- `src/hooks/useVault.ts:1180` (wallet ERC-20s via Alchemy)

Passing the raw-wei string into `convertToWei` multiplies it by `10**decimals` again. Result: `balanceInSmallestUnit` is inflated by `10**decimals`, so `amountInSmallestUnit > balanceInSmallestUnit` virtually never fires for any non-zero balance. The 0-balance case fires correctly only because `convertToWei("0", _)` short-circuits to `0n` (see `src/lib/utils.ts:49-51`).

**Net effect today**: the contract is the actual overdraft gatekeeper. Not user-harmful (contract rejects with revert), but the client-side check is dead.

## The fix

`token.balance` is already in raw-wei form. Just parse it:

```ts
const balanceInSmallestUnit = BigInt(token.balance);
```

Apply identically to all three validators. No other change.

Edge cases to confirm in your read before you change anything:
1. Is `token.balance` ever something OTHER than a raw-wei string anywhere in the modal code paths? Trace it back from the validator to the source. If it ever IS a human-decimal string in some code path, this fix would break that path — STOP, write `notes/worker-w3-followup.md`, exit.
2. Is `BigInt(token.balance)` safe for the values in scope? `bigIntToFullPrecisionString` (the source of most balances) produces decimal-integer strings — yes, safe. `walletBalance.value.toString()` from wagmi — yes, safe. `(vaultBalanceData as bigint).toString()` — yes, safe.

## Diagnosis you MUST write in the commit body

Read the three validators AND `bigIntToFullPrecisionString` AND `convertToWei` (`src/lib/utils.ts`) end-to-end first. Then answer in the commit body:

1. Confirm the bug exists in all three validators identically (cite the line numbers).
2. Confirm `token.balance` is raw-wei in every code path that reaches the three validators (cite the upstream lines in `useVault.ts` AND `Index.tsx`'s `vaultTokensWithNative` / `walletTokensWithNative` construction).
3. Explain why `BigInt(token.balance)` is safe — what kinds of strings does it receive, are they all decimal-integer strings, are any of them negative or empty?
4. Note the historic moment: the bug was likely introduced when balance storage flipped from human-decimal to raw-wei in v1.17.28 (commit `a43b859`, 2025-08-28). The validator wasn't updated.

If any answer above turns up something contradictory (e.g. you find a code path where `token.balance` is still a human-decimal string), STOP and write a followup note.

## Scope

### Files you MAY edit
- `src/components/modals/MultiTokenDepositModal.tsx`
- `src/components/modals/MultiTokenWithdrawModal.tsx`
- `src/components/modals/MultiTokenTransferModal.tsx`

ONLY the `validateDeposit` / `validateWithdrawal` / `validateTransfer` function in each. Don't touch the rest of those files.

### Files you MAY NOT edit
- Anything else. Don't touch `convertToWei`, don't touch `useVault.ts`, don't touch `Index.tsx`. If those need changing to make the fix safe, STOP and write `notes/worker-w3-followup.md` describing what else needs to happen.

## Verification gate

```sh
cd ~/Downloads/DEVELOPMENT/CYRUS/cyrusthegreat
source ~/.nvm/nvm.sh && nvm use 22.19.0
npx tsc --noEmit         # must be clean
npx vite build           # must succeed
```

Additionally — and this is the important one because the bug was silently dead for 10 months — write a small standalone HTML test page at `notes/w3-validator-test.html` that:
- Imports nothing; reproduces the validator logic inline (copy the fixed comparison into a script).
- Hardcodes 3 test cases: `(amount: "1.5", balance: "1000000000000000000", decimals: 18)` → must report insufficient is `false` (1.5 ETH < 1 ETH balance is FALSE — wait, 1.5 > 1, so insufficient is TRUE); and the inverse, and the 0-balance case.
- Logs PASS/FAIL for each.
- Open it in a browser to confirm. (Don't need a server, file:// works for inline scripts.)

The test page becomes part of the commit so future readers can sanity-check the math.

## Branch

```sh
git fetch origin main
git checkout main && git pull origin main
git checkout -b worker/w3-validator-fix
```

## Commit format

ONE commit. No more. Title:

```
fix(modals): validator compares wei to wei — don't pass raw-wei balance through convertToWei
```

Body:
- The 4 diagnosis answers above
- Which three lines changed (file paths + line numbers)
- A brief note that the prior comparison was effectively dead for non-zero balances, the contract was the real gatekeeper, and the fix restores client-side overdraft protection

## When done

- Push `worker/w3-validator-fix` to origin. Don't merge to main.
- Don't open a PR.
- Coordinator integrates.
