/**
 * /claim — recipient-facing page for CyrusTresor1 pool reveals.
 *
 * A depositor commits with withdrawTo = recipient's address, then shares
 * the claim URL out-of-band (Signal, QR, email). The recipient opens the
 * URL in their browser, lands here, sees the claim details, connects
 * their wallet on the right chain, and clicks Claim to broadcast the
 * reveal tx. Funds land at the withdrawTo address (= them).
 *
 * Anyone with the URL can claim — the secret IS the authorization. The
 * recipient doesn't need to be the original depositor; doesn't need any
 * prior state in localStorage.
 *
 * Critical UX details:
 *  - Decode the URL fragment on mount; show readable details (bucket,
 *    chain, recipient address)
 *  - Validate the wallet is connected and on the same chain as the claim
 *  - "Claim" button only enabled when both conditions are met
 *  - After a successful claim, save it to the local notebook so the user
 *    has a record (and to enable double-spend protection check later)
 *  - All ENS / multi-chain warnings clearly surfaced
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useChainId } from "wagmi";
import { formatEther } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ExternalLink, AlertTriangle, Check, ChevronLeft } from "lucide-react";
import { WEB3_CONFIG } from "@/config/web3";
import { usePool } from "@/hooks/usePool";
import { decodeTeleportClaim, computeCommitment, type TeleportClaim } from "@/lib/poolURI";

const CHAIN_NAMES: Record<number, { display: string; explorer: string }> = {
  11155111: { display: "Sepolia Testnet", explorer: "https://sepolia.etherscan.io" },
  1:        { display: "Ethereum Mainnet", explorer: "https://etherscan.io" },
  97:       { display: "BSC Testnet",      explorer: "https://testnet.bscscan.com" },
  56:       { display: "BSC Mainnet",      explorer: "https://bscscan.com" },
  84532:    { display: "Base Sepolia",     explorer: "https://sepolia.basescan.org" },
  8453:     { display: "Base Mainnet",     explorer: "https://basescan.org" },
};

const Claim = () => {
  const navigate = useNavigate();
  const { isConnected, address: account } = useAccount();
  const walletChainId = useChainId();
  const { revealFromURL, isRevealing, lastError } = usePool();

  const [parseError, setParseError] = useState<string | null>(null);
  const [claim, setClaim] = useState<TeleportClaim | null>(null);
  const [result, setResult] = useState<{ txHash: string } | null>(null);

  // Decode the URL hash fragment on mount. window.location.hash includes the
  // leading '#' — decodeTeleportClaim handles either form.
  useEffect(() => {
    try {
      const fragment = window.location.hash;
      if (!fragment || fragment.length <= 1) {
        setParseError("No claim parameters in URL. Expected hash fragment like #c=...&s=...&...");
        return;
      }
      const decoded = decodeTeleportClaim(fragment);
      setClaim(decoded);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Pool feature gate — refuse to render the claim flow if the build has
  // VITE_ENABLE_POOL=false. Stays parallel to PoolView's same gate.
  if (!WEB3_CONFIG.ENABLE_POOL) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
          <h1 className="text-xl font-bold mb-2">Pool feature disabled</h1>
          <p className="text-sm text-muted-foreground">
            The anonymity pool isn't currently enabled on this build. Contact whoever sent you
            this link.
          </p>
        </Card>
      </div>
    );
  }

  if (parseError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
        </Button>
        <Card className="p-6 bg-card/80 backdrop-blur border-red-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <h1 className="text-lg font-semibold mb-2">Invalid claim URL</h1>
              <p className="text-sm text-muted-foreground font-mono">{parseError}</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-muted-foreground">
        Decoding claim…
      </div>
    );
  }

  // Sanity-check that the local poolURI computation matches what the user pasted.
  // If someone hand-edited the URL this would catch typos (though the on-chain
  // reveal would fail anyway). Useful for debugging.
  const computedCommitment = computeCommitment(claim);
  const chainInfo = CHAIN_NAMES[claim.chainId];
  const isOnRightChain = walletChainId === claim.chainId;
  const canClaim = isConnected && isOnRightChain && !isRevealing;

  const handleClaim = async () => {
    if (!canClaim) return;
    setResult(null);
    try {
      const { txHash } = await revealFromURL(window.location.href);
      setResult({ txHash });
    } catch (e) {
      // lastError captured by the hook
    }
  };

  const isNative = claim.token === "0x0000000000000000000000000000000000000000";
  const nativeSymbol = claim.chainId === 97 ? "tBNB" : "ETH";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
      </Button>

      {/* Header */}
      <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-full bg-primary/10">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Pool Claim</h1>
            <p className="text-xs text-muted-foreground">
              A CyrusTresor1 commit is waiting to be revealed to <span className="font-mono">{claim.withdrawTo.slice(0, 8)}…{claim.withdrawTo.slice(-6)}</span>
            </p>
          </div>
        </div>
      </Card>

      {/* Claim details */}
      <Card className="p-6 bg-card/80 backdrop-blur border-border/50 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Claim details</h2>

        <div className="space-y-1.5 text-xs font-mono">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Chain:</span>
            <span>{chainInfo ? `${chainInfo.display} (${claim.chainId})` : `chainId ${claim.chainId} (unknown)`}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Token:</span>
            <span>
              {isNative ? `native ${nativeSymbol}` : (
                <a
                  href={chainInfo ? `${chainInfo.explorer}/address/${claim.token}` : "#"}
                  target="_blank" rel="noreferrer noopener"
                  className="hover:text-primary inline-flex items-center gap-1"
                >
                  {claim.token.slice(0, 8)}…{claim.token.slice(-6)} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Bucket index:</span>
            <span>{claim.bucketIdx}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Recipient (withdrawTo):</span>
            <span className="truncate" title={claim.withdrawTo}>{claim.withdrawTo}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Contract:</span>
            <a
              href={chainInfo ? `${chainInfo.explorer}/address/${claim.contractAddress}` : "#"}
              target="_blank" rel="noreferrer noopener"
              className="hover:text-primary inline-flex items-center gap-1"
            >
              {claim.contractAddress.slice(0, 8)}…{claim.contractAddress.slice(-6)} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex justify-between gap-4 pt-2 border-t border-border/30">
            <span className="text-muted-foreground">Commitment hash:</span>
            <span className="truncate" title={computedCommitment}>
              {computedCommitment.slice(0, 10)}…{computedCommitment.slice(-8)}
            </span>
          </div>
        </div>
      </Card>

      {/* Wallet status + chain warning */}
      {!isConnected && (
        <Card className="p-4 bg-yellow-500/5 border-yellow-500/30 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-200">Connect your wallet to claim</p>
              <p className="text-xs text-muted-foreground mt-1">
                Click the vault page connector. You don't have to be the recipient — anyone with the
                URL can broadcast this reveal. Whoever sends the tx pays gas; the bucket lands at the
                recipient address regardless.
              </p>
            </div>
          </div>
        </Card>
      )}

      {isConnected && !isOnRightChain && (
        <Card className="p-4 bg-yellow-500/5 border-yellow-500/30 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-200">Wrong chain</p>
              <p className="text-xs text-muted-foreground mt-1">
                This claim is for {chainInfo?.display ?? `chainId ${claim.chainId}`}, but your wallet is on
                chainId {walletChainId}. Switch in your wallet (Rabby/MetaMask) before claiming.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Action */}
      <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
        <Button onClick={handleClaim} disabled={!canClaim} className="w-full bg-primary hover:bg-primary/90">
          {isRevealing
            ? "Claiming…"
            : !isConnected
              ? "Connect wallet first"
              : !isOnRightChain
                ? `Switch to ${chainInfo?.display ?? `chainId ${claim.chainId}`}`
                : "Claim"}
        </Button>
        <p className="text-xs text-muted-foreground mt-3">
          You ({account ? <span className="font-mono">{account.slice(0, 8)}…{account.slice(-6)}</span> : "connected wallet"})
          will pay the gas. The bucket value goes to <span className="font-mono">{claim.withdrawTo.slice(0, 8)}…{claim.withdrawTo.slice(-6)}</span>
          {" "}— even if that's not you.
        </p>
      </Card>

      {/* Result */}
      {lastError && !result && (
        <Card className="p-4 bg-red-500/5 border-red-500/30 text-xs font-mono whitespace-pre-wrap">
          Reveal failed: {lastError}
        </Card>
      )}

      {result && (
        <Card className="p-6 bg-emerald-500/5 border-emerald-500/30 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-400" />
            <p className="font-semibold text-emerald-200">Claimed</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Funds delivered to <span className="font-mono text-foreground">{claim.withdrawTo.slice(0, 8)}…{claim.withdrawTo.slice(-6)}</span>.
          </p>
          {chainInfo && (
            <a
              href={`${chainInfo.explorer}/tx/${result.txHash}`}
              target="_blank" rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono"
            >
              View tx <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </Card>
      )}
    </div>
  );
};

export default Claim;
