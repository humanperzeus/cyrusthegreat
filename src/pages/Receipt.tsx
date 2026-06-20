/**
 * /receipt — standalone shareable receipt for any commit + reveal pair.
 *
 * Two ways to land here:
 *   1. /receipt?tx=0xCommitHash — read the commit tx from any of our
 *      5 chains, render a Stripe-style payment receipt
 *   2. /receipt#c=…&s=…&u=…&t=…&b=…&a=…&n=…&memo=…
 *      (the same fragment format as /claim) — render the receipt
 *      derived purely from the URL, no chain RPC needed
 *
 * Form 2 is strictly the more useful one: the payer shares this URL
 * with the recipient after paying. The recipient sees the receipt
 * details + a one-click "Claim" link to /claim (which reads the same
 * fragment + lets them broadcast the reveal once eligible).
 *
 * Form 1 (lookup-by-tx) requires no fragment but needs to find the
 * matching commit via chain RPC — slower, requires the user to know
 * the chain. Useful for "I lost the URL but I know the tx hash" cases.
 *
 * NO BACKEND. NO DB. Receipt is derived purely from the URL fragment
 * (form 2) or from a public chain read (form 1). Same security model
 * as /claim: anyone with the fragment can render the receipt, but
 * funds still only go to the bound withdrawTo at reveal time.
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Check, ExternalLink, Copy, Receipt as ReceiptIcon, AlertTriangle, Shield } from "lucide-react";
import { decodeTeleportClaim, computeCommitment, type TeleportClaim } from "@/lib/poolURI";

const CHAIN_NAMES: Record<number, { display: string; explorer: string; symbol: string }> = {
  11155111: { display: "Sepolia Testnet",       explorer: "https://sepolia.etherscan.io",      symbol: "ETH" },
  1:        { display: "Ethereum Mainnet",      explorer: "https://etherscan.io",              symbol: "ETH" },
  97:       { display: "BSC Testnet",           explorer: "https://testnet.bscscan.com",       symbol: "tBNB" },
  56:       { display: "BSC Mainnet",           explorer: "https://bscscan.com",               symbol: "BNB" },
  84532:    { display: "Base Sepolia",          explorer: "https://sepolia.basescan.org",      symbol: "ETH" },
  8453:     { display: "Base Mainnet",          explorer: "https://basescan.org",              symbol: "ETH" },
  421614:   { display: "Arbitrum Sepolia",      explorer: "https://sepolia.arbiscan.io",       symbol: "ETH" },
  42161:    { display: "Arbitrum One",          explorer: "https://arbiscan.io",               symbol: "ETH" },
  998:      { display: "HyperEVM Testnet",      explorer: "https://testnet.purrsec.com",       symbol: "HYPE" },
  999:      { display: "HyperEVM Mainnet",      explorer: "https://purrsec.com",               symbol: "HYPE" },
};

const Receipt = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const txFromURL = searchParams.get("tx");

  const [parseError, setParseError] = useState<string | null>(null);
  const [claim, setClaim] = useState<TeleportClaim | null>(null);
  const [memo, setMemo] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Form 2: parse the URL fragment on mount (same shape as /claim).
  // Memo is appended by PayForm as &memo=… in the search OR fragment;
  // accept both for resilience.
  useEffect(() => {
    try {
      const fragment = window.location.hash;
      if (!fragment || fragment.length <= 1) {
        // Form 1 path: no fragment but ?tx= in search params. Lookup-by-tx
        // is deferred until we wire chain reads — for v1, prompt user
        // for the full URL.
        if (txFromURL) {
          setParseError(
            `Looking up a receipt by tx hash alone (?tx=${txFromURL.slice(0, 10)}…) requires reading the chain — coming in a follow-up. For now, paste the FULL claim URL the payer shared with you (it includes #c=…&s=…&…).`
          );
          return;
        }
        setParseError(
          "No receipt parameters in URL. Expected a hash fragment like #c=…&s=…&u=…&t=…&b=…&a=…&n=… (same as /claim URLs)."
        );
        return;
      }

      // Pull memo out of the fragment if present; decoder ignores it.
      const fragParams = new URLSearchParams(fragment.slice(1));
      const memoFromFragment = fragParams.get("memo");
      if (memoFromFragment) setMemo(memoFromFragment);

      const decoded = decodeTeleportClaim(fragment);
      setClaim(decoded);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }, [txFromURL]);

  const commitment = useMemo(() => claim ? computeCommitment(claim) : undefined, [claim]);
  const chainInfo = claim ? CHAIN_NAMES[claim.chainId] : undefined;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (parseError || !claim) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
        </Button>
        <Card className="p-6 bg-gradient-card backdrop-blur border-yellow-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div>
              <h1 className="text-lg font-semibold mb-2">Receipt unavailable</h1>
              <p className="text-sm text-muted-foreground font-mono break-all">
                {parseError ?? "Decoding…"}
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const isNative = claim.token === "0x0000000000000000000000000000000000000000";
  const claimURL = `${window.location.origin}/claim${window.location.hash}`;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
      </Button>

      {/* Receipt header — Stripe-style "payment confirmed" framing */}
      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
        <div className="text-center pb-4 mb-4 border-b border-vault-primary/15">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mb-3">
            <Check className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold">Payment receipt</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Anonymous P2P payment via CyrusTeleport · cohort-based privacy
          </p>
        </div>

        {/* Memo prominent (if present) */}
        {memo && (
          <div className="bg-vault-primary/8 border-l-2 border-vault-primary/50 px-3 py-2 rounded-r mb-4">
            <p className="text-[10px] uppercase tracking-wide text-vault-primary/70 mb-1">Memo from sender</p>
            <p className="text-sm text-foreground italic">{memo}</p>
          </div>
        )}

        {/* Receipt line items */}
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-baseline">
            <span className="text-muted-foreground">Recipient (withdrawTo)</span>
            <span className="font-mono text-foreground">{claim.withdrawTo.slice(0, 10)}…{claim.withdrawTo.slice(-8)}</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-muted-foreground">Token</span>
            <span className="font-mono text-foreground">
              {isNative ? `Native ${chainInfo?.symbol ?? '?'}` : `${claim.token.slice(0, 10)}…${claim.token.slice(-8)}`}
            </span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-muted-foreground">Amount bucket</span>
            <span className="font-mono text-foreground">#{claim.bucketIdx}</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-muted-foreground">Chain</span>
            <span className="font-mono text-foreground">{chainInfo?.display ?? `chainId ${claim.chainId}`}</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-muted-foreground">Pool contract</span>
            <a
              href={chainInfo ? `${chainInfo.explorer}/address/${claim.contractAddress}` : "#"}
              target="_blank" rel="noreferrer noopener"
              className="font-mono text-vault-primary hover:underline inline-flex items-center gap-1"
            >
              {claim.contractAddress.slice(0, 10)}…{claim.contractAddress.slice(-8)} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex justify-between items-baseline pt-2 border-t border-vault-primary/15 mt-2">
            <span className="text-muted-foreground">Commitment hash</span>
            <span className="font-mono text-foreground text-[10px] break-all">{commitment?.slice(0, 16)}…{commitment?.slice(-12)}</span>
          </div>
        </div>

        {/* Cryptographic-proof badge */}
        <div className="mt-4 bg-emerald-500/5 border border-emerald-500/30 rounded-md px-3 py-2 flex items-start gap-2">
          <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-emerald-200 font-medium">Cryptographically verifiable.</span>{" "}
            Anyone with this URL can independently confirm the commitment hash exists on-chain via the
            pool contract on the explorer above. Recipient address is bound — funds can only land at
            <code className="font-mono text-foreground"> {claim.withdrawTo.slice(0, 8)}…{claim.withdrawTo.slice(-6)}</code>.
          </p>
        </div>
      </Card>

      {/* Action: claim CTA + share */}
      <Card className="p-4 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-3">
        <p className="text-xs text-muted-foreground">
          Recipient: <strong className="text-foreground">claim your funds at /claim</strong> (~1 hour after the commit was confirmed).
          Sender: <strong className="text-foreground">share this URL</strong> with the recipient via E2E-encrypted channels.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            onClick={() => navigate(`/claim${window.location.hash}`)}
            className="bg-vault-primary text-background hover:bg-vault-primary/90"
          >
            <ReceiptIcon className="w-4 h-4 mr-2" />
            Open in /claim
          </Button>
          <Button variant="outline" onClick={handleCopy} className="border-vault-primary/40">
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied" : "Copy receipt URL"}
          </Button>
        </div>
      </Card>

      {/* Plain URL display for visibility */}
      <Card className="p-3 bg-muted/10 border-border/30">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Receipt URL</p>
        <Input value={window.location.href} readOnly className="font-mono text-[10px]" />
      </Card>

      {/* Claim URL for explicit sharing */}
      <Card className="p-3 bg-muted/10 border-border/30">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Claim URL (recipient broadcasts the reveal here)</p>
        <Input value={claimURL} readOnly className="font-mono text-[10px]" />
      </Card>
    </div>
  );
};

export default Receipt;
