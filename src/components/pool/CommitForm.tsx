/**
 * CommitForm — depositor-side flow for the CyrusTresor1 anonymity pool.
 *
 * UX:
 *   1. User picks a bucket size (from the on-chain schedule)
 *   2. Sets withdrawTo (their own address by default; can paste any address
 *      including a recipient for the teleport-to-someone-else flow)
 *   3. Reviews the cost (bucketSize + dynamicFee) and the eligible epoch
 *   4. Clicks Commit → Rabby pops up → tx submits
 *   5. After confirmation, the form shows the tx link + the claim URL
 *      they can share with the recipient via Signal/QR/email
 *
 * Native (ETH/BNB) only for now. ERC-20 buckets are deferred until the
 * approve() flow is implemented in usePool.
 */

import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { formatEther, type Address } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, ExternalLink, Copy, Check, AlertTriangle } from "lucide-react";
import {
  usePool,
  usePoolBucketSizes,
  usePoolCurrentFee,
  usePoolCurrentEpoch,
} from "@/hooks/usePool";

const NATIVE_TOKEN: Address = "0x0000000000000000000000000000000000000000";

interface CommitFormProps {
  activeChain: "ETH" | "BSC" | "BASE";
}

const explorerForChain = (chain: "ETH" | "BSC" | "BASE", txHash: string): string => {
  if (chain === "ETH") return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (chain === "BSC") return `https://testnet.bscscan.com/tx/${txHash}`;
  if (chain === "BASE") return `https://sepolia.basescan.org/tx/${txHash}`;
  return "#";
};

export const CommitForm = ({ activeChain }: CommitFormProps) => {
  const { address: account, isConnected } = useAccount();
  const { commit, isCommitting, lastError, contractAddress } = usePool();
  const { sizes: bucketSizes, isLoading: loadingBuckets } = usePoolBucketSizes(NATIVE_TOKEN);
  const { feeWei, isLoading: loadingFee } = usePoolCurrentFee();
  const { epoch: currentEpoch } = usePoolCurrentEpoch();

  const [bucketIdx, setBucketIdx] = useState<number>(0);
  const [withdrawTo, setWithdrawTo] = useState<string>("");
  const [result, setResult] = useState<{ txHash: string; claimURL: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Default withdrawTo to user's connected address. Only set on initial mount
  // so the user can edit it after.
  useMemo(() => {
    if (!withdrawTo && account) setWithdrawTo(account);
  }, [account, withdrawTo]);

  const bucketSize = bucketSizes[bucketIdx];
  const nativeSymbol = activeChain === "BSC" ? "tBNB" : "ETH";

  const totalWei = bucketSize != null && feeWei != null ? bucketSize + feeWei : undefined;
  const eligibleEpoch = currentEpoch != null ? currentEpoch + 1 : undefined;
  const eligibleAtMs = eligibleEpoch != null ? eligibleEpoch * 3600 * 1000 : undefined;

  const withdrawToValid = /^0x[a-fA-F0-9]{40}$/.test(withdrawTo);
  const canSubmit =
    isConnected && contractAddress && bucketSize != null && feeWei != null && withdrawToValid && !isCommitting;

  const handleCommit = async () => {
    if (!canSubmit || bucketSize == null || feeWei == null) return;
    setResult(null);
    try {
      const { txHash, claimURL } = await commit({
        withdrawTo: withdrawTo as Address,
        token: NATIVE_TOKEN,
        bucketIdx,
        bucketSize,
        feeWei,
      });
      setResult({ txHash, claimURL });
    } catch (e) {
      // commit() already records lastError; nothing else to do
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.claimURL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Not deployed on this chain (e.g. mainnet currently `notdeployednow`)
  if (!contractAddress) {
    return (
      <Card className="p-6 bg-card/80 backdrop-blur border-yellow-500/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-200">CyrusTresor1 not deployed on {activeChain}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Currently testnet-only. Switch the chain selector above to Sepolia/BSC Testnet/Base Sepolia,
              or wait for the mainnet deployment.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card/80 backdrop-blur border-border/50 space-y-5">
      <div className="flex items-center gap-2">
        <Lock className="w-5 h-5 text-primary" />
        <h3 className="text-base font-semibold">Commit to Anonymity Pool</h3>
      </div>

      {/* Bucket picker */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Bucket size</Label>
        {loadingBuckets ? (
          <div className="text-xs text-muted-foreground py-2">Loading bucket schedule…</div>
        ) : bucketSizes.length === 0 ? (
          <div className="text-xs text-yellow-500 py-2">No buckets configured for this token on this chain.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {bucketSizes.map((size, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setBucketIdx(idx)}
                className={`px-3 py-2 rounded-md text-sm font-mono transition-colors border ${
                  idx === bucketIdx
                    ? "bg-primary/20 border-primary/40 text-foreground"
                    : "bg-card/50 border-border/40 text-muted-foreground hover:border-border"
                }`}
              >
                {formatEther(size)} {nativeSymbol}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* withdrawTo */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
          Recipient address (withdrawTo)
        </Label>
        <div className="flex gap-2">
          <Input
            value={withdrawTo}
            onChange={(e) => setWithdrawTo(e.target.value)}
            placeholder="0x…"
            className="font-mono text-xs"
          />
          {account && account !== withdrawTo && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWithdrawTo(account)}
              className="whitespace-nowrap"
            >
              Use my address
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Funds will be claimable AT this exact address. The address is baked into the commitment hash
          (MEV-safe — an attacker who sees the secret cannot redirect funds).
        </p>
      </div>

      {/* Summary */}
      {bucketSize != null && feeWei != null && (
        <div className="rounded-md border border-border/40 bg-card/50 p-3 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bucket size:</span>
            <span>{formatEther(bucketSize)} {nativeSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dynamic fee:</span>
            <span>{formatEther(feeWei)} {nativeSymbol}</span>
          </div>
          <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1.5">
            <span>Total sent:</span>
            <span className="font-semibold">{totalWei != null ? formatEther(totalWei) : "—"} {nativeSymbol}</span>
          </div>
          {eligibleAtMs != null && (
            <div className="flex justify-between text-muted-foreground pt-1.5 border-t border-border/40 mt-1.5">
              <span>Eligible to reveal:</span>
              <span>epoch {eligibleEpoch} ({new Date(eligibleAtMs).toLocaleString()})</span>
            </div>
          )}
        </div>
      )}

      {/* Action */}
      <Button
        onClick={handleCommit}
        disabled={!canSubmit}
        className="w-full bg-primary hover:bg-primary/90"
      >
        {isCommitting ? "Committing…" : !isConnected ? "Connect wallet first" : !withdrawToValid ? "Enter a valid recipient address" : "Commit"}
      </Button>

      {/* Error surface */}
      {lastError && !result && (
        <div className="text-xs text-red-400 font-mono whitespace-pre-wrap">
          {lastError}
        </div>
      )}

      {/* Result */}
      {result && (
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/30 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-200">Committed — save the claim link below</p>
          </div>
          <div className="text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Tx:</span>
              <a
                href={explorerForChain(activeChain, result.txHash)}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-foreground hover:text-primary inline-flex items-center gap-1"
              >
                {result.txHash.slice(0, 10)}…{result.txHash.slice(-8)} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Claim URL (share with recipient):</span>
              <div className="flex gap-2">
                <Input value={result.claimURL} readOnly className="font-mono text-xs flex-1" />
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-yellow-200">
                ⚠️ Anyone with this URL can claim the funds. Share via end-to-end-encrypted channels only
                (Signal, Matrix E2EE). Treat like cash.
              </p>
            </div>
          </div>
        </Card>
      )}
    </Card>
  );
};
