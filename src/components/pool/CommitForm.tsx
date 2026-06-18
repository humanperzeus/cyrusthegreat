/**
 * CommitForm — depositor-side flow for the CyrusTresor1 anonymity pool.
 *
 * UX:
 *   1. User picks a token (ETH or stablecoin per POOL_TOKENS_BY_CHAIN)
 *   2. User picks a bucket size (from the on-chain schedule for that token)
 *   3. Sets withdrawTo (their own address by default; can paste any address
 *      including a recipient for the teleport-to-someone-else flow)
 *   4. Reviews the cost (bucketSize + dynamicFee) and the eligible epoch
 *   5. For ERC-20 tokens: if allowance < bucketSize, Approve button shows
 *      → Rabby pops up → approve tx confirms → Commit button enables
 *   6. Clicks Commit → Rabby pops up → tx submits
 *   7. After confirmation, the form shows the tx link + the claim URL
 *      they can share with the recipient via Signal/QR/email
 */

import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { formatUnits, type Address } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, ExternalLink, Copy, Check, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  usePool,
  usePoolBucketSizes,
  usePoolCurrentFee,
  usePoolCurrentEpoch,
  useTokenAllowance,
  POOL_TOKENS_BY_CHAIN,
  NATIVE_TOKEN_ADDRESS,
  type PoolTokenEntry,
} from "@/hooks/usePool";
import { ClaimQR } from "@/components/pool/ClaimQR";

interface CommitFormProps {
  activeChain: "ETH" | "BSC" | "BASE" | "HYPER" | "ARB";
}

const explorerForChain = (chain: "ETH" | "BSC" | "BASE" | "HYPER" | "ARB", txHash: string): string => {
  if (chain === "ETH") return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (chain === "BSC") return `https://testnet.bscscan.com/tx/${txHash}`;
  if (chain === "BASE") return `https://sepolia.basescan.org/tx/${txHash}`;
  if (chain === "HYPER") return `https://testnet.purrsec.com/tx/${txHash}`;
  if (chain === "ARB") return `https://sepolia.arbiscan.io/tx/${txHash}`;
  return "#";
};

// Map UI chain label to numeric chainId so we can resolve POOL_TOKENS_BY_CHAIN.
const CHAIN_ID_FOR: Record<"ETH" | "BSC" | "BASE" | "HYPER" | "ARB", number> = { ETH: 11155111, BSC: 97, BASE: 84532, HYPER: 998, ARB: 421614 };

export const CommitForm = ({ activeChain }: CommitFormProps) => {
  const { address: account, isConnected } = useAccount();
  const { commit, approveToken, isCommitting, isApproving, lastError, contractAddress } = usePool();

  // Available tokens for the active chain (filtered to pool-supported ones).
  // Defaults to the first entry (native), but user can switch.
  const availableTokens: PoolTokenEntry[] = POOL_TOKENS_BY_CHAIN[CHAIN_ID_FOR[activeChain]] ?? [];
  const [selectedToken, setSelectedToken] = useState<PoolTokenEntry | undefined>(undefined);

  // Sync selectedToken to the first available when chain changes
  useMemo(() => {
    if (availableTokens.length === 0) { setSelectedToken(undefined); return; }
    if (!selectedToken || !availableTokens.some((t) => t.address === selectedToken.address)) {
      setSelectedToken(availableTokens[0]);
    }
  }, [availableTokens, selectedToken]);

  const token = selectedToken?.address ?? NATIVE_TOKEN_ADDRESS;
  const tokenDecimals = selectedToken?.decimals ?? 18;
  const tokenSymbol = selectedToken?.symbol ?? "ETH";
  const isNative = token === NATIVE_TOKEN_ADDRESS;

  const { sizes: bucketSizes, isLoading: loadingBuckets } = usePoolBucketSizes(token);
  const { feeWei, isLoading: loadingFee } = usePoolCurrentFee();
  const { epoch: currentEpoch } = usePoolCurrentEpoch();
  const { allowance, refetch: refetchAllowance } = useTokenAllowance(token, account);

  const [bucketIdx, setBucketIdx] = useState<number>(0);
  const [withdrawTo, setWithdrawTo] = useState<string>("");
  const [result, setResult] = useState<{ txHash: string; claimURL: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Default withdrawTo to user's connected address. Only set on initial mount
  // so the user can edit it after.
  useMemo(() => {
    if (!withdrawTo && account) setWithdrawTo(account);
  }, [account, withdrawTo]);

  // Reset bucketIdx when token changes (different schedules may have fewer buckets)
  useMemo(() => { setBucketIdx(0); }, [token]);

  const bucketSize = bucketSizes[bucketIdx];
  const nativeSymbol =
    activeChain === "BSC" ? "tBNB"
    : activeChain === "HYPER" ? "HYPE"
    : "ETH"; // ETH, BASE, ARB all use ETH as native

  // Native: fee + bucketSize go via msg.value. ERC-20: only fee via msg.value;
  // bucketSize is pulled by the contract via transferFrom (requires allowance).
  const totalNativeWei = bucketSize != null && feeWei != null
    ? (isNative ? bucketSize + feeWei : feeWei)
    : undefined;
  const eligibleEpoch = currentEpoch != null ? currentEpoch + 1 : undefined;
  const eligibleAtMs = eligibleEpoch != null ? eligibleEpoch * 3600 * 1000 : undefined;

  const withdrawToValid = /^0x[a-fA-F0-9]{40}$/.test(withdrawTo);
  const needsApproval = !isNative && bucketSize != null && allowance < bucketSize;

  const canApprove =
    isConnected && contractAddress && !isNative && bucketSize != null && !isApproving && needsApproval;
  const canCommit =
    isConnected &&
    contractAddress &&
    bucketSize != null &&
    feeWei != null &&
    withdrawToValid &&
    !isCommitting &&
    !needsApproval;

  const handleApprove = async () => {
    if (!canApprove || bucketSize == null) return;
    try {
      await approveToken({ token, amount: bucketSize });
      // After mining, wagmi's useReadContract polls; nudge it for instant UX.
      refetchAllowance();
    } catch (e) {
      // hook recorded lastError
    }
  };

  const handleCommit = async () => {
    if (!canCommit || bucketSize == null || feeWei == null) return;
    setResult(null);
    try {
      const { txHash, claimURL } = await commit({
        withdrawTo: withdrawTo as Address,
        token,
        bucketIdx,
        bucketSize,
        feeWei,
      });
      setResult({ txHash, claimURL });
    } catch (e) {
      // commit() already records lastError
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
      <Card className="p-6 bg-gradient-card backdrop-blur border-yellow-500/30">
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
    <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-5">
      <div className="flex items-center gap-2">
        <Lock className="w-5 h-5 text-vault-primary" />
        <h3 className="text-base font-semibold">Commit to Anonymity Pool</h3>
      </div>

      {/* Token picker (shows only if >1 token is available on this chain) */}
      {availableTokens.length > 1 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Token</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {availableTokens.map((t) => (
              <button
                key={t.address}
                type="button"
                onClick={() => setSelectedToken(t)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
                  selectedToken?.address === t.address
                    ? "bg-vault-primary/20 border-vault-primary/60 text-vault-primary"
                    : "bg-vault-primary/5 border-vault-primary/20 text-muted-foreground hover:border-vault-primary/40"
                }`}
              >
                {t.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

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
                    ? "bg-vault-primary/20 border-vault-primary/60 text-vault-primary"
                    : "bg-vault-primary/5 border-vault-primary/20 text-muted-foreground hover:border-vault-primary/40"
                }`}
              >
                {formatUnits(size, tokenDecimals)} {isNative ? nativeSymbol : tokenSymbol}
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
        <div className="rounded-md border border-vault-primary/20 bg-vault-primary/5 p-3 space-y-1.5 text-xs font-mono">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bucket size:</span>
            <span>{formatUnits(bucketSize, tokenDecimals)} {isNative ? nativeSymbol : tokenSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dynamic fee:</span>
            <span>{formatUnits(feeWei, 18)} {nativeSymbol}</span>
          </div>
          <div className="flex justify-between border-t border-vault-primary/20 pt-1.5 mt-1.5">
            <span>{isNative ? "Total sent:" : "msg.value (fee only):"}</span>
            <span className="font-semibold">
              {totalNativeWei != null ? formatUnits(totalNativeWei, 18) : "—"} {nativeSymbol}
              {!isNative && (
                <span className="block text-muted-foreground font-normal text-[10px] mt-0.5">
                  + {formatUnits(bucketSize, tokenDecimals)} {tokenSymbol} pulled via transferFrom
                </span>
              )}
            </span>
          </div>
          {eligibleAtMs != null && (
            <div className="flex justify-between text-muted-foreground pt-1.5 border-t border-vault-primary/20 mt-1.5">
              <span>Eligible to reveal:</span>
              <span>epoch {eligibleEpoch} ({new Date(eligibleAtMs).toLocaleString()})</span>
            </div>
          )}
        </div>
      )}

      {/* Allowance status row — only relevant for ERC-20 tokens */}
      {!isNative && bucketSize != null && (
        <div className="rounded-md border border-vault-primary/15 bg-vault-primary/5 px-3 py-2 text-xs font-mono flex items-center gap-2">
          <ShieldCheck className={`w-3.5 h-3.5 ${needsApproval ? 'text-yellow-500' : 'text-emerald-400'}`} />
          <span className="text-muted-foreground">Allowance:</span>
          <span className={needsApproval ? "text-yellow-200" : "text-emerald-200"}>
            {formatUnits(allowance, tokenDecimals)} {tokenSymbol}
          </span>
          {needsApproval && (
            <span className="text-yellow-200/70 ml-auto">need ≥ {formatUnits(bucketSize, tokenDecimals)}</span>
          )}
        </div>
      )}

      {/* Action button(s) — Approve when allowance insufficient, else Commit */}
      {!isNative && needsApproval ? (
        <Button
          onClick={handleApprove}
          disabled={!canApprove}
          className="w-full bg-vault-primary text-background hover:bg-vault-primary/90"
        >
          {isApproving ? "Approving…" : !isConnected ? "Connect wallet first" : `Approve ${formatUnits(bucketSize!, tokenDecimals)} ${tokenSymbol}`}
        </Button>
      ) : (
      <Button
        onClick={handleCommit}
        disabled={!canCommit}
        className="w-full bg-vault-primary text-background hover:bg-vault-primary/90"
      >
        {isCommitting ? "Committing…" : !isConnected ? "Connect wallet first" : !withdrawToValid ? "Enter a valid recipient address" : "Commit"}
      </Button>
      )}

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
                className="font-mono text-foreground hover:text-vault-primary inline-flex items-center gap-1"
              >
                {result.txHash.slice(0, 10)}…{result.txHash.slice(-8)} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="space-y-2">
              <span className="text-muted-foreground">Claim URL (share with recipient):</span>
              <div className="flex gap-2">
                <Input value={result.claimURL} readOnly className="font-mono text-xs flex-1" />
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start pt-2">
                <ClaimQR value={result.claimURL} size={160} />
                <p className="text-xs text-yellow-200 sm:flex-1">
                  ⚠️ Anyone with this URL <em>or QR code</em> can claim the funds. Share via end-to-end-
                  encrypted channels only (Signal, Matrix E2EE) — or show the QR directly to the
                  recipient in person. Treat like cash.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </Card>
  );
};
