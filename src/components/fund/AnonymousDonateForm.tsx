/**
 * AnonymousDonateForm — privacy-pool donation flow for /fund campaigns.
 *
 * Pairs with DonateForm (direct transfer, public, instant). This form
 * routes the donation through CyrusTeleport's commit-reveal pool — donor
 * anonymity preserved, but the donor MUST broadcast the reveal at T+1h
 * for funds to actually reach the recipient.
 *
 * UX is explicitly louder than PayForm here because the failure mode
 * (donor forgets, recipient never sees funds) is catastrophic for
 * fundraising:
 *   1. Pre-commit: forced acknowledgement checkbox + ramp/payment trade-off
 *      table visible BEFORE the donate button enables.
 *   2. Post-commit: huge "save this NOW" warning + QR + countdown + 4
 *      backup actions (download QR, email link, copy URL, bookmark page).
 *   3. After eligible: prominent "Broadcast claim" CTA so the donor can
 *      complete the donation right from /fund without bouncing to the
 *      v2 notebook.
 *
 * Native ETH donations: SUPPORTED here (the pool handles native +
 * ERC-20 uniformly). Direct mode only does ERC-20 because that path
 * needs Transfer events for progress; the pool emits its own events
 * so progress tracking works for native too.
 */

import { useState, useMemo, useEffect } from "react";
import { useChainId, useAccount } from "wagmi";
import { formatUnits, type Address, type Hex } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle, Check, Copy, Download, Mail, Bookmark, Clock, ShieldCheck, Wallet,
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
import { useConnectWallet } from "@/hooks/useConnectWallet";
import { ClaimQR } from "@/components/pool/ClaimQR";

interface AnonymousDonateFormProps {
  recipient: Address;
  /** Token symbol the campaign was created with — used to default-select */
  tokenSymbol: string;
  /** Campaign title — used in the auto-saved memo + email subject */
  campaignTitle: string;
}

/** ~1h epoch boundary on the pool contract — used for the countdown display.
 *  Real eligibility is "next epoch", which could be anywhere from seconds to
 *  ~1h after commit depending on when you commit within the epoch. We show
 *  the conservative upper bound + then poll to see if the contract accepts
 *  the reveal. */
const EPOCH_SECONDS = 60 * 60;

export const AnonymousDonateForm: React.FC<AnonymousDonateFormProps> = ({
  recipient,
  tokenSymbol,
  campaignTitle,
}) => {
  // Hoist account ONCE at the top. Calling useAccount() again lower down —
  // and worse, inside a JSX `&&` short-circuit — is a rules-of-hooks
  // violation (the hook runs conditionally) and crashes the whole tree to
  // a black screen. All consumers below use this `account`.
  const { address: account, isConnected } = useAccount();
  const connectWallet = useConnectWallet();
  const chainId = useChainId();
  const { commit, revealFromURL, isCommitting, isApproving, isRevealing, lastError, contractAddress } = usePool();
  const { startProgress, updateProgress } = useProgress();

  // Resolve the campaign's token from the symbol + chain. If not found,
  // first ERC-20 fallback (pool accepts native + ERC-20; we default to
  // stablecoin for donation framing).
  const availableTokens: PoolTokenEntry[] = POOL_TOKENS_BY_CHAIN[chainId] ?? [];
  const matchedToken = useMemo(
    () => availableTokens.find(t => t.symbol.toLowerCase() === tokenSymbol.toLowerCase()),
    [availableTokens, tokenSymbol],
  );
  const fallbackToken = useMemo(
    () => availableTokens.find(t => t.address !== NATIVE_TOKEN_ADDRESS) ?? availableTokens[0],
    [availableTokens],
  );
  const selectedToken: PoolTokenEntry | undefined = matchedToken ?? fallbackToken;
  const token: Address = selectedToken?.address ?? NATIVE_TOKEN_ADDRESS;
  const tokenDecimals = selectedToken?.decimals ?? 18;
  const tokenSymbolResolved = selectedToken?.symbol ?? "ETH";
  const isNative = token === NATIVE_TOKEN_ADDRESS;

  const { sizes: bucketSizes, isLoading: loadingBuckets } = usePoolBucketSizes(token);
  const { feeWei } = usePoolCurrentFee();
  const { allowance } = useTokenAllowance(token, account);
  const { balance } = usePoolTokenBalance(token, account);

  const [bucketIdx, setBucketIdx] = useState<number>(0);
  const [ackChecked, setAckChecked] = useState<boolean>(false);
  const [result, setResult] = useState<{
    txHash: Hex;
    claimURL: string;
    eligibleAt: number; // ms epoch
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [revealResult, setRevealResult] = useState<{ txHash: Hex } | null>(null);

  // Countdown ticker — updates every second once we have a result.
  // Stops once we hit the eligible threshold so the broadcast CTA can take over.
  const [nowMs, setNowMs] = useState<number>(() => +new Date());
  useEffect(() => {
    if (!result) return;
    const id = setInterval(() => setNowMs(+new Date()), 1000);
    return () => clearInterval(id);
  }, [result]);

  const bucketSize = bucketSizes[bucketIdx];
  const requiredBalance: bigint | undefined = bucketSize != null && feeWei != null
    ? (isNative ? bucketSize + feeWei : bucketSize)
    : undefined;
  const hasEnough = requiredBalance == null ? true : balance >= requiredBalance;
  const needsApproval = !isNative && bucketSize != null && allowance < bucketSize;

  const canCommit =
    isConnected && contractAddress && bucketSize != null && feeWei != null &&
    !isCommitting && !isApproving && hasEnough && ackChecked;

  const handleCommit = async () => {
    if (!canCommit || bucketSize == null || feeWei == null) return;
    const amountLabel = `${formatUnits(bucketSize, tokenDecimals)} ${tokenSymbolResolved}`;
    const seed = needsApproval
      ? [
          { label: `Approve ${tokenSymbolResolved}`, status: 'running' as const },
          { label: 'Sign donation in wallet',         status: 'pending' as const },
          { label: 'Confirm on-chain',                 status: 'pending' as const },
          { label: 'Save your claim secret',           status: 'pending' as const },
        ]
      : [
          { label: 'Sign donation in wallet', status: 'running' as const, detail: `Preparing ${amountLabel}…` },
          { label: 'Confirm on-chain',         status: 'pending' as const },
          { label: 'Save your claim secret',   status: 'pending' as const },
        ];
    const sessionId = startProgress(`Donate · ${amountLabel} · anonymous`, seed);
    try {
      const { txHash, claimURL } = await commit({
        withdrawTo: recipient,
        token,
        bucketIdx,
        bucketSize,
        feeWei,
        onProgress: (steps) => updateProgress(sessionId, steps),
      });
      const memo = `Anonymous donation · ${campaignTitle.slice(0, 60)}`;
      const claimURLWithMemo = `${claimURL}&memo=${encodeURIComponent(memo)}`;
      setResult({
        txHash,
        claimURL: claimURLWithMemo,
        eligibleAt: +new Date() + EPOCH_SECONDS * 1000,
      });
    } catch {
      // commit() surfaces lastError already
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.claimURL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // QR download — finds the SVG inside ClaimQR, serializes to PNG, triggers
  // a browser download. Self-contained so we don't need to plumb a ref into
  // ClaimQR (which is a tight 3rd-party-style component).
  const handleDownloadQR = () => {
    if (!result) return;
    const container = document.getElementById('anon-donate-qr');
    const svg = container?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(img, 0, 0, 512, 512);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(pngBlob);
        a.download = `cyrusthegreat-claim-${result.txHash.slice(0, 10)}.png`;
        a.click();
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleEmailSelf = () => {
    if (!result) return;
    const subject = encodeURIComponent(`CyrusTresor claim · ${campaignTitle}`);
    const body = encodeURIComponent(
      `Your anonymous donation claim URL — keep this safe.\n\n` +
      `${result.claimURL}\n\n` +
      `Open this link after ${new Date(result.eligibleAt).toLocaleString()} and click "Broadcast claim" ` +
      `to complete the donation. Until then, the funds are locked in the privacy pool.\n\n` +
      `Tx: ${result.txHash}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 1500);
  };

  const handleBroadcast = async () => {
    if (!result) return;
    const sessionId = startProgress(`Broadcast donation claim`, [
      { label: 'Sign reveal in wallet',  status: 'running' as const },
      { label: 'Confirm on-chain',         status: 'pending' as const },
      { label: 'Donation delivered',       status: 'pending' as const },
    ]);
    try {
      const { txHash } = await revealFromURL(result.claimURL, (steps) => updateProgress(sessionId, steps));
      setRevealResult({ txHash });
    } catch {
      // revealFromURL surfaces lastError
    }
  };

  // ---------------------------------------------------------------
  // Guard rendering
  // ---------------------------------------------------------------
  if (!contractAddress) {
    return (
      <Card className="p-4 bg-gradient-card backdrop-blur border-yellow-500/30">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Anonymous donations aren't available on this chain — the CyrusTeleport pool isn't deployed here.
            Switch your wallet to Sepolia, BSC Testnet, Base Sepolia, Arbitrum Sepolia, or HyperEVM.
          </p>
        </div>
      </Card>
    );
  }

  // ---------------------------------------------------------------
  // Post-commit "save this NOW" screen (with countdown + broadcast)
  // ---------------------------------------------------------------
  if (result) {
    const remainingMs = Math.max(0, result.eligibleAt - nowMs);
    const eligible = remainingMs === 0;
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    const countdown = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Donation fully delivered — show terminal success
    if (revealResult) {
      return (
        <Card className="p-6 bg-emerald-500/5 border-emerald-500/40 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-200">Donation delivered — thank you!</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Your anonymous donation reached <code className="font-mono">{recipient.slice(0, 8)}…{recipient.slice(-6)}</code> —
            it's in their wallet now.
          </p>
          <p className="text-[10px] text-muted-foreground/70 font-mono">Reveal tx: {revealResult.txHash}</p>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {/* Big warning header with countdown */}
        <Card className={`p-5 border-2 space-y-2 ${eligible ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-yellow-500/50 bg-yellow-500/5'}`}>
          <div className="flex items-center gap-2">
            {eligible
              ? <Check className="w-6 h-6 text-emerald-400" />
              : <AlertTriangle className="w-6 h-6 text-yellow-500" />}
            <p className={`text-base font-semibold ${eligible ? 'text-emerald-200' : 'text-yellow-200'}`}>
              {eligible ? 'Ready to deliver — broadcast now to complete the donation' : 'Donation NOT complete yet — save this NOW'}
            </p>
          </div>
          {!eligible && (
            <>
              <p className="text-xs text-yellow-200/90 leading-relaxed">
                Your donation is locked in the pool. Funds reach the campaign owner only when YOU broadcast the claim at:
              </p>
              <div className="flex items-baseline gap-2">
                <Clock className="w-5 h-5 text-yellow-400" />
                <span className="text-3xl font-mono font-semibold text-yellow-200">{countdown}</span>
                <span className="text-[11px] text-yellow-200/70">remaining until claimable</span>
              </div>
            </>
          )}
        </Card>

        {/* Save 3 backups */}
        <Card className="p-5 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Save at least one backup · pick any</p>

          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4 items-start">
            <div id="anon-donate-qr" className="flex justify-center">
              <ClaimQR value={result.claimURL} size={160} />
            </div>
            <div className="space-y-2">
              <Button variant="outline" onClick={handleDownloadQR} className="w-full justify-start text-xs gap-2">
                <Download className="w-4 h-4" /> Download QR as PNG
              </Button>
              <Button variant="outline" onClick={handleEmailSelf} className="w-full justify-start text-xs gap-2">
                {emailSent ? <Check className="w-4 h-4 text-emerald-400" /> : <Mail className="w-4 h-4" />}
                {emailSent ? 'Email opened' : 'Email link to myself'}
              </Button>
              <Button variant="outline" onClick={handleCopy} className="w-full justify-start text-xs gap-2">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy URL · save to notes'}
              </Button>
              <div className="text-xs text-muted-foreground flex items-start gap-2 px-2 py-1.5 rounded-md bg-vault-primary/5 border border-vault-primary/15">
                <Bookmark className="w-3.5 h-3.5 text-vault-primary mt-0.5" />
                <span>Bookmark this page in your browser to return later (Cmd/Ctrl+D).</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-emerald-200 flex items-start gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border-l-4 border-emerald-500">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5" />
            <span>Auto-saved to this browser's notebook · access from <a href="/" className="underline">v2 → CyrusTeleport → Notebook</a></span>
          </div>
        </Card>

        {/* What happens next */}
        <Card className="p-5 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">What happens next</p>
          <ol className="text-xs text-muted-foreground list-decimal pl-5 space-y-1 leading-relaxed">
            <li>Wait ~1 hour — funds locked in pool while the privacy cohort builds up.</li>
            <li>Return to this URL or open Notebook in v2 → click <span className="text-vault-primary">Broadcast claim</span>.</li>
            <li>Pay ~$0.10 gas — campaign receives {bucketSize != null ? formatUnits(bucketSize, tokenDecimals) : '…'} {tokenSymbolResolved} instantly.</li>
          </ol>
          <p className="text-[11px] text-yellow-200/90 pt-1">
            ⚠ If you close this tab AND clear browser data without saving the URL above, the donation is permanently locked.
          </p>
        </Card>

        {/* Eligible → big broadcast CTA */}
        {eligible && (
          <Button
            onClick={handleBroadcast}
            disabled={isRevealing}
            className="w-full bg-vault-primary text-background hover:bg-vault-primary/90 text-base py-6"
          >
            {isRevealing ? 'Broadcasting…' : 'Broadcast claim · deliver donation now'}
          </Button>
        )}

        {lastError && (
          <p className="text-xs text-red-400 font-mono whitespace-pre-wrap">{lastError}</p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Pre-commit form
  // ---------------------------------------------------------------
  return (
    <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-vault-primary" />
        <h3 className="text-base font-semibold">Donate anonymously</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Your wallet address stays private via the CyrusTeleport pool. <strong className="text-yellow-200">You must come back in ~1 hour</strong> to broadcast the claim
        or save the URL we generate after commit — otherwise the donation can't reach the campaign.
      </p>

      {/* Amount picker — bucket-locked because pool requires fixed sizes */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Amount ({tokenSymbolResolved})</Label>
        {loadingBuckets ? (
          <div className="text-xs text-muted-foreground py-2">Loading bucket sizes…</div>
        ) : bucketSizes.length === 0 ? (
          <div className="text-xs text-yellow-500 py-2">No amounts configured for {tokenSymbolResolved} on this chain.</div>
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
                {formatUnits(size, tokenDecimals)} {tokenSymbolResolved}
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/70">
          The pool uses fixed bucket sizes to enforce k-anonymity — your donation joins others of the same size.
        </p>
      </div>

      {/* Balance pre-flight */}
      {bucketSize != null && account && !hasEnough && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-mono flex items-center gap-2">
          <span className="text-muted-foreground">Balance:</span>
          <span className="text-red-300">{formatUnits(balance, tokenDecimals)} {tokenSymbolResolved}</span>
          {requiredBalance != null && (
            <span className="text-red-300/90 ml-auto">need {formatUnits(requiredBalance, tokenDecimals)}</span>
          )}
        </div>
      )}

      {/* Forced acknowledgement */}
      <label className="flex items-start gap-2 cursor-pointer px-3 py-2 rounded-md border border-yellow-500/30 bg-yellow-500/5">
        <input
          type="checkbox"
          checked={ackChecked}
          onChange={(e) => setAckChecked(e.target.checked)}
          className="mt-1 accent-yellow-500"
        />
        <span className="text-xs text-yellow-200/90 leading-relaxed">
          I understand the donation only completes when I broadcast the claim after ~1 hour. I will save the QR or URL — if I lose it AND clear my browser, the donation is permanently locked.
        </span>
      </label>

      {/* Primary CTA — connects the wallet itself when disconnected. */}
      {!isConnected ? (
        <Button
          onClick={connectWallet}
          className="w-full bg-gradient-vault text-primary-foreground shadow-vault hover:opacity-90"
        >
          <Wallet className="w-4 h-4 mr-2" /> Connect wallet to donate
        </Button>
      ) : (
        <Button
          onClick={handleCommit}
          disabled={!canCommit}
          className="w-full bg-vault-primary text-background hover:bg-vault-primary/90"
        >
          {(() => {
            if (isApproving) return 'Approving…';
            if (isCommitting) return 'Committing to pool…';
            if (bucketSize == null) return 'Pick an amount';
            if (!hasEnough && requiredBalance != null) {
              return `Need ${formatUnits(requiredBalance, tokenDecimals)} ${tokenSymbolResolved}`;
            }
            if (!ackChecked) return 'Acknowledge the warning above';
            return `Donate anonymously · ${formatUnits(bucketSize, tokenDecimals)} ${tokenSymbolResolved}`;
          })()}
        </Button>
      )}

      {lastError && (
        <p className="text-xs text-red-400 font-mono whitespace-pre-wrap">{lastError}</p>
      )}
    </Card>
  );
};
