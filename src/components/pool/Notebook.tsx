/**
 * Notebook — the depositor's local list of pending CyrusTresor1 commits.
 *
 * Each entry corresponds to a successful commitToPool tx. Stored in
 * localStorage (via usePool's notebook). The secret + userSalt are saved
 * so the user can reveal later without re-typing — but this means anyone
 * with browser access to the same localStorage can also reveal. Treat the
 * browser like a wallet for this feature.
 *
 * After ≥1 epoch elapses (currentEpoch > depositEpoch), the Reveal button
 * unlocks. The user clicks it, Rabby pops up, and the bucket lands at the
 * commit's withdrawTo address.
 *
 * UI principles:
 *  - Reuses the same Card / Button / mono-font aesthetic as the rest of the dapp
 *  - Pending entries show a countdown until reveal-eligible
 *  - Revealed entries show a checkmark + tx link
 *  - Expandable section per entry for the claim URL (rarely needed in self-pay,
 *    but essential for the teleport-to-someone-else flow)
 */

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Check, ExternalLink, Copy, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { usePool, usePoolCurrentEpoch } from "@/hooks/usePool";
import { buildClaimURL, type TeleportClaim } from "@/lib/poolURI";
import type { NotebookEntry } from "@/hooks/usePool";

interface NotebookProps {
  activeChain: "ETH" | "BSC" | "BASE";
}

const explorerForChain = (chain: "ETH" | "BSC" | "BASE", txHash: string): string => {
  if (chain === "ETH") return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (chain === "BSC") return `https://testnet.bscscan.com/tx/${txHash}`;
  if (chain === "BASE") return `https://sepolia.basescan.org/tx/${txHash}`;
  return "#";
};

const formatCountdown = (msUntil: number): string => {
  if (msUntil <= 0) return "eligible now";
  const minutes = Math.floor(msUntil / 60_000);
  const seconds = Math.floor((msUntil % 60_000) / 1_000);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m ${seconds}s`;
};

export const Notebook = ({ activeChain }: NotebookProps) => {
  const { notebook, isRevealing, reveal, clearNotebook } = usePool();
  const { epoch: currentEpoch } = usePoolCurrentEpoch();
  const [expandedClaim, setExpandedClaim] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Tick every 10s so countdowns refresh smoothly even when currentEpoch
  // (which only changes once an hour) doesn't trigger a re-render.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  if (notebook.length === 0) return null;

  const handleReveal = async (entry: NotebookEntry) => {
    setRevealError(null);
    try {
      await reveal(entry);
    } catch (e) {
      setRevealError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCopyClaim = async (entry: NotebookEntry) => {
    const url = buildClaimURL(`${window.location.origin}/claim`, entry.claim as TeleportClaim);
    await navigator.clipboard.writeText(url);
    setCopied(entry.commitment);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Card className="p-6 bg-card/80 backdrop-blur border-border/50 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold">Your Commits (notebook)</h3>
          <span className="text-xs text-muted-foreground">
            {notebook.filter((e) => !e.spent).length} pending · {notebook.filter((e) => e.spent).length} revealed
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Stored in this browser only. Anyone with access to this browser's localStorage can claim these
        commits. Clearing the notebook before revealing makes the funds unrecoverable.
      </p>

      <div className="space-y-3">
        {notebook.map((entry) => {
          const isEligible = currentEpoch != null && currentEpoch > entry.depositEpoch;
          const eligibleEpoch = entry.depositEpoch + 1;
          const eligibleAtMs = eligibleEpoch * 3600 * 1000;
          const msUntil = eligibleAtMs - Date.now();
          const nativeSymbol = entry.claim.token === "0x0000000000000000000000000000000000000000"
            ? (activeChain === "BSC" ? "tBNB" : "ETH")
            : entry.claim.token.slice(0, 6) + "…";
          const isCurrentChain = entry.claim.chainId === (activeChain === "ETH" ? 11155111 : activeChain === "BSC" ? 97 : 84532);

          return (
            <div
              key={entry.commitment}
              className={`rounded-md border p-3 space-y-2 ${
                entry.spent
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : isEligible
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/40 bg-card/40"
              }`}
            >
              {/* Top row: status + bucket + withdrawTo */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {entry.spent ? (
                  <span className="text-emerald-300 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" /> Revealed
                  </span>
                ) : isEligible ? (
                  <span className="text-primary font-medium">Ready to reveal</span>
                ) : (
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatCountdown(msUntil)}
                  </span>
                )}
                <span className="font-mono text-foreground">
                  bucket {entry.claim.bucketIdx} ({nativeSymbol})
                </span>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono text-muted-foreground" title={entry.claim.withdrawTo}>
                  {entry.claim.withdrawTo.slice(0, 8)}…{entry.claim.withdrawTo.slice(-6)}
                </span>
                {!isCurrentChain && (
                  <span className="text-yellow-500 text-xs">
                    (chainId {entry.claim.chainId} — switch wallet)
                  </span>
                )}
              </div>

              {/* Detail row: commitment + tx links */}
              <div className="text-xs text-muted-foreground font-mono space-y-1">
                <div className="truncate">
                  <span className="text-muted-foreground/70">commit hash:</span>{" "}
                  {entry.commitment.slice(0, 12)}…{entry.commitment.slice(-10)}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {entry.commitTx && entry.commitTx !== "0x" && (
                    <a
                      href={explorerForChain(activeChain, entry.commitTx)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-foreground/70 hover:text-primary inline-flex items-center gap-1"
                    >
                      commit tx <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {entry.revealTx && (
                    <a
                      href={explorerForChain(activeChain, entry.revealTx)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1"
                    >
                      reveal tx <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                {!entry.spent && (
                  <Button
                    size="sm"
                    onClick={() => handleReveal(entry)}
                    disabled={!isEligible || isRevealing || !isCurrentChain}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {isRevealing ? "Revealing…" : !isCurrentChain ? "Switch chain" : isEligible ? "Reveal" : "Not eligible yet"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setExpandedClaim(expandedClaim === entry.commitment ? null : entry.commitment)}
                  className="text-xs"
                >
                  {expandedClaim === entry.commitment ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                  Claim URL
                </Button>
              </div>

              {/* Expandable claim URL */}
              {expandedClaim === entry.commitment && (
                <div className="pt-2 space-y-1.5 border-t border-border/30">
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={buildClaimURL(`${window.location.origin}/claim`, entry.claim as TeleportClaim)}
                      className="font-mono text-xs flex-1"
                    />
                    <Button size="sm" variant="outline" onClick={() => handleCopyClaim(entry)}>
                      {copied === entry.commitment ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-yellow-200/80">
                    ⚠️ Anyone with this URL can claim the funds. Share via end-to-end-encrypted channels only.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {revealError && (
        <div className="text-xs text-red-400 font-mono whitespace-pre-wrap">
          Reveal failed: {revealError}
        </div>
      )}

      <div className="pt-3 border-t border-border/30">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (
              confirm(
                "Clear the notebook? Any UNREVEALED commits become permanently unrecoverable — the secret only lives here in localStorage. This does NOT cancel on-chain commitments; it just forgets the secrets locally."
              )
            ) {
              clearNotebook();
            }
          }}
          className="text-xs text-muted-foreground hover:text-red-300"
        >
          <Trash2 className="w-3 h-3 mr-1" />
          Reset notebook
        </Button>
      </div>
    </Card>
  );
};
