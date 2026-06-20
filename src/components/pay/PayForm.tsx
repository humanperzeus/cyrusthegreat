/**
 * PayForm — the /pay surface. Payment-themed wrapper around the existing
 * CyrusTeleport commit primitive.
 *
 * Differences from CommitForm.tsx (which v2 PoolView uses):
 *  - No mode tabs (Teleport / Escrow). Every /pay submission is a P2P
 *    payment to someone else's address. Escrow stays in v2 where the
 *    framing exists.
 *  - No "Use my address" button. /pay is "pay someone else" — defaulting
 *    to your own address would be confusing.
 *  - Optional memo field (200 char, stored in the URL fragment of the
 *    resulting claim/receipt URL — never sent to a server).
 *  - "Buy with [provider] →" placeholder below the pay CTA. Disabled
 *    until Transak's sandbox key arrives + integration ships. Tooltip
 *    explains the flow.
 *  - Same contract calls (usePool.commit), same 3- or 4-step
 *    ProgressFlow lifecycle, same fresh-allowance read, same pre-flight
 *    balance check.
 *
 * Pre-onramp UX: user must already have stablecoin in their wallet. The
 * "Buy with Apple Pay" placeholder makes the future flow legible
 * without lying about availability.
 */

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount, useBalance } from "wagmi";
import { formatUnits, type Address } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Send, Coins, ShieldCheck, AlertTriangle, Check, ExternalLink, Copy,
} from "lucide-react";
import {
  usePool,
  usePoolBucketSizes,
  usePoolCurrentFee,
  useTokenAllowance,
  usePoolTokenBalance,
  POOL_TOKENS_BY_CHAIN,
  NATIVE_TOKEN_ADDRESS,
  type PoolTokenEntry,
} from "@/hooks/usePool";
import { useProgress } from "@/contexts/ProgressContext";
import { ClaimQR } from "@/components/pool/ClaimQR";
import { OnrampButton } from "@/components/shared/OnrampButton";

interface PayFormProps {
  activeChain: "ETH" | "BSC" | "BASE" | "HYPER" | "ARB";
}

const explorerForChain = (chain: PayFormProps["activeChain"], txHash: string): string => {
  if (chain === "ETH")   return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (chain === "BSC")   return `https://testnet.bscscan.com/tx/${txHash}`;
  if (chain === "BASE")  return `https://sepolia.basescan.org/tx/${txHash}`;
  if (chain === "HYPER") return `https://testnet.purrsec.com/tx/${txHash}`;
  if (chain === "ARB")   return `https://sepolia.arbiscan.io/tx/${txHash}`;
  return "#";
};

const CHAIN_ID_FOR: Record<PayFormProps["activeChain"], number> = {
  ETH: 11155111, BSC: 97, BASE: 84532, HYPER: 998, ARB: 421614,
};

export const PayForm = ({ activeChain }: PayFormProps) => {
  const { address: account, isConnected } = useAccount();
  const { commit, isCommitting, isApproving, lastError, contractAddress } = usePool();
  const { startProgress, updateProgress } = useProgress();

  // searchParams hoisted up — token auto-select effect below reads it
  // before the rest of the URL-param handlers down at line ~140 run.
  const [searchParams] = useSearchParams();

  const availableTokens: PoolTokenEntry[] = POOL_TOKENS_BY_CHAIN[CHAIN_ID_FOR[activeChain]] ?? [];
  const [selectedToken, setSelectedToken] = useState<PoolTokenEntry | undefined>(undefined);
  // Token auto-selection priority:
  //   1. URL param ?token=USD1 (highest — explicit sender choice)
  //   2. When ?amount= is set, prefer the first stablecoin (sender
  //      probably meant USD value, not ETH value — "25" in ETH terms
  //      is wildly different from "25" in USD1 terms, and the bug
  //      reported was /pay?amount=25 defaulting to ETH and mismatching
  //      the user's intent).
  //   3. Fall back to first token in the registry (native).
  // Re-evaluates only when the available token set changes (chain
  // switch or token registry update) so user's manual picks aren't
  // overwritten.
  useEffect(() => {
    if (availableTokens.length === 0) { setSelectedToken(undefined); return; }
    if (selectedToken && availableTokens.some(t => t.address === selectedToken.address)) return;

    const tokenFromURL = searchParams.get("token");
    if (tokenFromURL) {
      const match = availableTokens.find(t => t.symbol.toLowerCase() === tokenFromURL.toLowerCase());
      if (match) { setSelectedToken(match); return; }
    }

    const amountFromURL_inner = searchParams.get("amount");
    if (amountFromURL_inner) {
      const stable = availableTokens.find(t => t.address !== NATIVE_TOKEN_ADDRESS);
      if (stable) { setSelectedToken(stable); return; }
    }

    setSelectedToken(availableTokens[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTokens]);

  const token = selectedToken?.address ?? NATIVE_TOKEN_ADDRESS;
  const tokenDecimals = selectedToken?.decimals ?? 18;
  const tokenSymbol = selectedToken?.symbol ?? "ETH";
  const isNative = token === NATIVE_TOKEN_ADDRESS;
  const nativeSymbol =
    activeChain === "BSC" ? "tBNB"
    : activeChain === "HYPER" ? "HYPE"
    : "ETH";

  const { sizes: bucketSizes, isLoading: loadingBuckets } = usePoolBucketSizes(token);
  const { feeWei } = usePoolCurrentFee();
  const { allowance, refetch: refetchAllowance } = useTokenAllowance(token, account);
  const { balance: tokenBalance } = usePoolTokenBalance(token, account);
  const { data: nativeBalanceData } = useBalance({ address: account, query: { enabled: !!account && isNative } });
  const effectiveBalance: bigint = isNative
    ? (nativeBalanceData?.value ?? 0n)
    : tokenBalance;

  const [bucketIdx, setBucketIdx] = useState<number>(0);
  const [recipient, setRecipient] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [result, setResult] = useState<{ txHash: string; claimURL: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Pay-link pre-fill — when a business shares
  // cyrusthegreat.dev/pay?to=0xWallet&memo=customer:alice123 with a
  // customer, we read both params on mount. Recipient locks (read-only
  // input + override link); memo pre-fills but stays editable so the
  // customer can append their own note. Sub-page for businesses to
  // generate these URLs is a follow-up — for now the URL params just
  // work and a tip line in the form tells users they can construct them.
  // searchParams already destructured above. Read individual params here.
  const recipientFromURL = searchParams.get("to");
  const memoFromURL = searchParams.get("memo");
  const amountFromURL = searchParams.get("amount");
  const [recipientLocked, setRecipientLocked] = useState<boolean>(false);
  const [amountLocked, setAmountLocked] = useState<boolean>(false);
  useEffect(() => {
    if (recipientFromURL && /^0x[a-fA-F0-9]{40}$/.test(recipientFromURL)) {
      setRecipient(recipientFromURL);
      setRecipientLocked(true);
    }
    if (memoFromURL) setMemo(memoFromURL.slice(0, 200));
    // intentionally empty deps — URL params only read once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // amountLocked also drives bucket-picker visibility — see render below.
  // We can't compute the matching bucket until bucketSizes load, so the
  // bucket-locking happens in a second effect downstream once sizes arrive.
  useEffect(() => {
    if (!amountFromURL || bucketSizes.length === 0) return;
    const requested = parseFloat(amountFromURL);
    if (!isFinite(requested) || requested <= 0) return;
    // Match the closest bucket size by display-units (formatUnits-rounded).
    let bestIdx = 0;
    let bestDiff = Infinity;
    bucketSizes.forEach((size, idx) => {
      const display = parseFloat(formatUnits(size, tokenDecimals));
      const diff = Math.abs(display - requested);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = idx; }
    });
    setBucketIdx(bestIdx);
    setAmountLocked(true);
    // re-run when sizes / decimals change (token swap)
  }, [amountFromURL, bucketSizes, tokenDecimals]);

  // Simplified mode = arriving via a pre-filled pay link. Hides the
  // pay-link tip + collapses allowance / balance / fee technical rows
  // behind a "Details" disclosure. Goal: a customer hitting a pay link
  // sees ~4 things — recipient (locked), amount (locked or simple
  // picker), Pay button, that's it.
  const simplifiedMode = recipientLocked;

  useMemo(() => { setBucketIdx(0); }, [token]);

  const bucketSize = bucketSizes[bucketIdx];
  const recipientValid = /^0x[a-fA-F0-9]{40}$/.test(recipient);
  const needsApproval = !isNative && bucketSize != null && allowance < bucketSize;

  const requiredBalance: bigint | undefined = bucketSize != null && feeWei != null
    ? (isNative ? bucketSize + feeWei : bucketSize)
    : undefined;
  const hasEnoughBalance: boolean = requiredBalance == null ? true : effectiveBalance >= requiredBalance;

  const canPay =
    isConnected && contractAddress && bucketSize != null && feeWei != null &&
    recipientValid && !isCommitting && !isApproving && hasEnoughBalance;

  const handlePay = async () => {
    if (!canPay || bucketSize == null || feeWei == null) return;
    setResult(null);
    const amountLabel = `${formatUnits(bucketSize, tokenDecimals)} ${isNative ? nativeSymbol : tokenSymbol}`;
    const seed = needsApproval
      ? [
          { label: `Approve ${tokenSymbol}`,  status: 'running' as const, detail: `Allowance ${formatUnits(allowance, tokenDecimals)} ${tokenSymbol} → need ${formatUnits(bucketSize, tokenDecimals)}` },
          { label: 'Sign payment in wallet',  status: 'pending' as const },
          { label: 'Confirm on-chain',         status: 'pending' as const },
          { label: 'Receipt ready',            status: 'pending' as const },
        ]
      : [
          { label: 'Sign payment in wallet',  status: 'running' as const, detail: `Preparing ${amountLabel}…` },
          { label: 'Confirm on-chain',         status: 'pending' as const },
          { label: 'Receipt ready',            status: 'pending' as const },
        ];
    const sessionId = startProgress(`Pay · ${amountLabel}`, seed);
    try {
      const { txHash, claimURL } = await commit({
        withdrawTo: recipient as Address,
        token, bucketIdx, bucketSize, feeWei,
        onProgress: (steps) => updateProgress(sessionId, steps),
      });
      // Append memo to the URL fragment so the receipt view can render it
      // without server-side storage. URL-encoded; trimmed to 200 chars at
      // input time.
      const claimURLWithMemo = memo
        ? `${claimURL}&memo=${encodeURIComponent(memo)}`
        : claimURL;
      setResult({ txHash, claimURL: claimURLWithMemo });
      if (needsApproval) refetchAllowance();
    } catch {
      // commit() already surfaces lastError + marks lifecycle step failed
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.claimURL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!contractAddress) {
    return (
      <Card className="p-6 bg-gradient-card backdrop-blur border-yellow-500/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-200">Payments not available on {activeChain}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Switch chains above (Sepolia, BSC Testnet, Base Sepolia, Arbitrum Sepolia, HyperEVM) — pool contract isn't deployed on the current selection.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-5">
      <div className="flex items-center gap-2">
        <Send className="w-5 h-5 text-vault-primary" />
        <h3 className="text-base font-semibold">Pay anyone, privately</h3>
      </div>

      {/* Recipient — first thing the user sees, biggest decision.
          Locked when arriving via a pre-filled pay link (?to=0x…). */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
          Pay to (wallet address)
        </Label>
        <Input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x… (the recipient's wallet address)"
          className={`font-mono text-xs ${recipientLocked ? 'bg-vault-primary/10 text-vault-primary border-vault-primary/40' : ''}`}
          readOnly={recipientLocked}
        />
        {recipientLocked ? (
          <p className="text-xs text-vault-primary">
            🔒 Address locked by sender's pay link.{" "}
            <button type="button" onClick={() => setRecipientLocked(false)} className="underline hover:text-vault-primary/80">
              Override
            </button>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Get this from whoever you're paying. Funds will land at this exact address — baked into the
            commitment hash (MEV-safe).
          </p>
        )}
      </div>

      {/* Token picker — only shown when chain has >1 token configured */}
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

      {/* Amount (bucket size). When amount is locked via URL, show a
          single "amount confirmation" card instead of the picker grid. */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Amount</Label>
        {loadingBuckets ? (
          <div className="text-xs text-muted-foreground py-2">Loading…</div>
        ) : bucketSizes.length === 0 ? (
          <div className="text-xs text-yellow-500 py-2">No amounts configured for this token on this chain.</div>
        ) : amountLocked && bucketSize != null ? (
          <div className="rounded-md border border-vault-primary/60 bg-vault-primary/15 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Sender requested</p>
            <p className="text-2xl font-mono text-vault-primary mt-1">
              {formatUnits(bucketSize, tokenDecimals)} {isNative ? nativeSymbol : tokenSymbol}
            </p>
            <button
              type="button"
              onClick={() => setAmountLocked(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground underline mt-2"
            >
              Override amount
            </button>
          </div>
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

      {/* Optional memo (URL fragment, never server-side) */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Memo (optional)</Label>
        <Input
          value={memo}
          onChange={(e) => setMemo(e.target.value.slice(0, 200))}
          placeholder="Invoice #1234 · service description · note for the recipient"
          className="text-xs"
        />
        <p className="text-[10px] text-muted-foreground/70 text-right">{memo.length} / 200</p>
      </div>

      {/* Balance + allowance pre-flight.
          In simplified mode (pre-filled link customer) these technical
          rows are tucked into a "Details ▾" disclosure so the visible
          form stays minimal. The insufficient-balance case ALWAYS
          surfaces (red border) regardless of mode — too important to
          hide behind a toggle.
          In normal mode (advanced user) the rows are shown inline. */}
      {bucketSize != null && account && !hasEnoughBalance && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-mono flex items-center gap-2">
          <Coins className="w-3.5 h-3.5 text-red-400" />
          <span className="text-muted-foreground">Balance:</span>
          <span className="text-red-300">
            {formatUnits(effectiveBalance, tokenDecimals)} {isNative ? nativeSymbol : tokenSymbol}
          </span>
          {requiredBalance != null && (
            <span className="text-red-300/90 ml-auto">need {formatUnits(requiredBalance, tokenDecimals)}</span>
          )}
        </div>
      )}
      {simplifiedMode ? (
        bucketSize != null && account && hasEnoughBalance && (
          <details className="rounded-md border border-vault-primary/15 bg-vault-primary/5 px-3 py-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground select-none">Details (balance, allowance, fee)</summary>
            <div className="mt-2 space-y-1 font-mono">
              <div className="flex items-center gap-2">
                <Coins className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-muted-foreground">Balance:</span>
                <span className="text-emerald-200">{formatUnits(effectiveBalance, tokenDecimals)} {isNative ? nativeSymbol : tokenSymbol}</span>
                <span className="text-emerald-200/70 ml-auto">enough to pay</span>
              </div>
              {!isNative && (
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-3.5 h-3.5 ${needsApproval ? 'text-yellow-500' : 'text-emerald-400'}`} />
                  <span className="text-muted-foreground">Allowance:</span>
                  <span className={needsApproval ? 'text-yellow-200' : 'text-emerald-200'}>{formatUnits(allowance, tokenDecimals)} {tokenSymbol}</span>
                  {needsApproval && <span className="text-yellow-200/70 ml-auto">approve step will run first</span>}
                </div>
              )}
            </div>
          </details>
        )
      ) : (
        <>
          {bucketSize != null && account && hasEnoughBalance && (
            <div className="rounded-md border border-vault-primary/15 bg-vault-primary/5 px-3 py-2 text-xs font-mono flex items-center gap-2">
              <Coins className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-muted-foreground">Balance:</span>
              <span className="text-emerald-200">
                {formatUnits(effectiveBalance, tokenDecimals)} {isNative ? nativeSymbol : tokenSymbol}
              </span>
              <span className="text-emerald-200/70 ml-auto">enough to pay</span>
            </div>
          )}
          {!isNative && bucketSize != null && (
            <div className="rounded-md border border-vault-primary/15 bg-vault-primary/5 px-3 py-2 text-xs font-mono flex items-center gap-2">
              <ShieldCheck className={`w-3.5 h-3.5 ${needsApproval ? 'text-yellow-500' : 'text-emerald-400'}`} />
              <span className="text-muted-foreground">Allowance:</span>
              <span className={needsApproval ? 'text-yellow-200' : 'text-emerald-200'}>
                {formatUnits(allowance, tokenDecimals)} {tokenSymbol}
              </span>
              {needsApproval ? (
                <span className="text-yellow-200/70 ml-auto">approve step will run first</span>
              ) : (
                <span className="text-emerald-200/70 ml-auto">no approve needed</span>
              )}
            </div>
          )}
        </>
      )}

      {/* Primary CTA */}
      <Button
        onClick={handlePay}
        disabled={!canPay}
        className="w-full bg-vault-primary text-background hover:bg-vault-primary/90"
      >
        {(() => {
          if (isApproving) return "Approving…";
          if (isCommitting) return "Sending payment…";
          if (!isConnected) return "Connect wallet first";
          if (!recipientValid) return "Enter recipient address";
          if (!hasEnoughBalance && requiredBalance != null) {
            return `Need ${formatUnits(requiredBalance, tokenDecimals)} ${isNative ? nativeSymbol : tokenSymbol}`;
          }
          const amountLabel = bucketSize != null
            ? `${formatUnits(bucketSize, tokenDecimals)} ${isNative ? nativeSymbol : tokenSymbol}`
            : '';
          return `Pay ${amountLabel}`;
        })()}
      </Button>

      {/* Onramp button — provider-agnostic scaffold. Renders disabled
          until an onramp provider (Transak / MoonPay / Ramp / Onramp.money)
          approves us; wiring happens inside OnrampButton when one lands. */}
      <OnrampButton
        recipientAddress={account}
        amountFiat={bucketSize != null ? formatUnits(bucketSize, tokenDecimals) : undefined}
        cryptoSymbol={tokenSymbol}
        chain={activeChain}
      />

      {/* Pay-link tip — shows only in normal mode (advanced user, not
          on a pre-filled link). Now points at /get-paid for the form
          rather than asking users to construct the URL by hand. */}
      {!simplifiedMode && (
        <div className="text-[11px] text-muted-foreground/80 leading-relaxed bg-vault-primary/5 border border-vault-primary/15 rounded-md px-3 py-2">
          💡 <strong>Are you a business?</strong> Generate a pre-filled pay link to share with
          customers — they just pick the amount and pay.{" "}
          <a href="/get-paid" className="text-vault-primary hover:underline">
            Create payment link →
          </a>
        </div>
      )}

      {/* Error surface */}
      {lastError && !result && (
        <div className="text-xs text-red-400 font-mono whitespace-pre-wrap">{lastError}</div>
      )}

      {/* Success: shareable receipt URL */}
      {result && (
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/30 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-200">Payment sent — share this receipt with the recipient</p>
          </div>
          <div className="text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Tx:</span>
              <a
                href={explorerForChain(activeChain, result.txHash)}
                target="_blank" rel="noreferrer noopener"
                className="font-mono text-foreground hover:text-vault-primary inline-flex items-center gap-1"
              >
                {result.txHash.slice(0, 10)}…{result.txHash.slice(-8)} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="space-y-2">
              <span className="text-muted-foreground">Receipt URL (share with recipient — they claim here):</span>
              <div className="flex gap-2">
                <Input value={result.claimURL} readOnly className="font-mono text-xs flex-1" />
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start pt-2">
                <ClaimQR value={result.claimURL} size={140} />
                <p className="text-xs text-yellow-200 sm:flex-1">
                  ⚠ Anyone with this URL or QR code can broadcast the reveal — they get nothing,
                  but the recipient address (above) receives the funds. Share with the recipient via
                  end-to-end-encrypted channels (Signal, Matrix E2EE) or in person.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </Card>
  );
};
