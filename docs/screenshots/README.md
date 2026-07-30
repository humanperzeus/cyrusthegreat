# Screenshots

Capture targets referenced from the project root [README.md](../../README.md#screenshots). All PNGs, suggested width 1200-1600px.

| Filename | Capture recipe |
|---|---|
| `01-cyrustresor-home.png` | cyrusthegreat.dev, v1 tab selected, wallet NOT connected. Shows the connect-wallet hero + chain switcher row. |
| `02-multi-token-deposit.png` | Connect a Sepolia testnet wallet with at least 0.01 ETH and 1+ ERC-20 (e.g. USD1). v1 → Deposit → toggle Multi-Token mode. Capture the modal mid-fill with 2-3 token rows. |
| `03-cyrusteleport-commit.png` | v2 tab, connect Sepolia wallet, pick USD1, pick a bucket, paste a 0x… recipient (different from your wallet). Capture the full commit form including the green "balance: enough to commit" row. |
| `04-cyrusteleport-escrow.png` | Same as 03 but click the Escrow tab. Capture the agent-address field + the yellow "treat the agent as if they hold the cash" warning block. |
| `05-notebook.png` | After ≥1 commit, scroll to the Notebook section. Best capture has at least one pending entry (gold countdown) and one revealed entry (emerald). If only pending exists, that's fine. |
| `06-progressflow-4step.png` | During an ERC-20 commit where allowance is insufficient. The ProgressFlow modal opens centered with 4 dots. Capture mid-flow — either at "Approve USD1 / running" or "Sign commit / running". |
| `07-stacked-chips.png` | Fire two commits in quick succession (e.g. open v2, commit a small bucket, immediately open v1 Deposit, fire it). Capture when both ProgressFlow sessions are visible — one centered, one as a chip bottom-right. |
| `08-claim-page.png` | Open cyrusthegreat.dev/claim with any existing claim URL fragment (or a synthetic one for the screenshot). No wallet needed if just showing the layout. Best capture has the gold heading + the claim-details card. |
| `09-mainnet-guard.png` | Click the **Mainnet** tab in the NetworkModeSwitch (top of v1 / v2). Page reloads to the "Mainnet not yet deployed" guard card. Capture the full viewport including the BuildBadge bottom-left. |

After capturing, drag each PNG into this directory with the matching filename, then `git add docs/screenshots/*.png && git commit -m "docs(readme): screenshots for grant reviewers"`.

For privacy: screenshots SHOULD show real testnet activity (better evidence of working software). They should NOT show wallet addresses or claim URLs that you don't want public — most of those are on testnets so impact is low, but blur or crop sensitive areas if needed.
