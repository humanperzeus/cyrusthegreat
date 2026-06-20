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

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { type Address, formatUnits } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ExternalLink, AlertTriangle, Check, ChevronLeft, Clock } from "lucide-react";
import { WEB3_CONFIG } from "@/config/web3";
import { usePool, usePoolCurrentEpoch, usePoolBucketSizes, useTokenDecimals, POOL_TOKENS_BY_CHAIN, NATIVE_TOKEN_ADDRESS } from "@/hooks/usePool";
import { useProgress } from "@/contexts/ProgressContext";
import { WalletConnector } from "@/components/WalletConnector";
import { decodeTeleportClaim, computeCommitment, type TeleportClaim } from "@/lib/poolURI";
import CyrusTresor1Artifact from "@/contracts/abis/CyrusTresor1.json";

const CTGTRESOR_ABI = (CyrusTresor1Artifact as { abi: readonly unknown[] }).abi;

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
  const { startProgress, updateProgress } = useProgress();

  const [parseError, setParseError] = useState<string | null>(null);
  const [claim, setClaim] = useState<TeleportClaim | null>(null);
  const [result, setResult] = useState<{ txHash: string } | null>(null);
  // Tick state for countdown re-renders — declared unconditionally to keep
  // hooks order stable (React Rules of Hooks: same hooks every render).
  const [, setTick] = useState(0);

  // Decode the URL hash fragment on mount.
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

  // Derived from `claim` — null-safe so we can compute these BEFORE the
  // early returns. Solves "hooks must run in same order" violation.
  const computedCommitment = claim ? computeCommitment(claim) : undefined;
  const claimChainId = claim?.chainId;
  const claimContract = claim?.contractAddress as Address | undefined;
  const isOnRightChain = walletChainId === claimChainId;

  // On-chain commitment lookup — gated by enabled flag so it doesn't run
  // until `claim` is decoded. Always called as a hook (stable order).
  const { data: commitmentState, isLoading: loadingCommitment, refetch: refetchCommitment } = useReadContract({
    address: claimContract,
    abi: CTGTRESOR_ABI,
    functionName: "commitments",
    args: computedCommitment ? [computedCommitment] : undefined,
    chainId: claimChainId,
    query: { enabled: !!claim && WEB3_CONFIG.ENABLE_POOL && isOnRightChain, refetchInterval: 15_000 },
  });
  const { epoch: currentEpoch } = usePoolCurrentEpoch();

  // Fetch the bucket size + token decimals so we can show a decimal-aware
  // amount ("10 USDC" instead of "bucket 0"). These hooks run unconditionally
  // for stable hooks-order; `enabled` gates keep them no-op until the claim
  // is decoded + on the right chain.
  const { sizes: bucketSizes } = usePoolBucketSizes(claim?.token as Address | undefined);
  const { decimals: tokenDecimals } = useTokenDecimals(claim?.token as Address | undefined);
  // Use the per-chain registry if available (most reliable), else fall back to
  // the on-chain decimals() read above, else default to 18.
  const registryEntry = claim
    ? (POOL_TOKENS_BY_CHAIN[claim.chainId] || []).find((t) => t.address.toLowerCase() === claim.token.toLowerCase())
    : undefined;
  const displayDecimals = registryEntry?.decimals ?? tokenDecimals;
  const displaySymbol = registryEntry?.symbol
    ?? (claim?.token === NATIVE_TOKEN_ADDRESS ? (claim?.chainId === 97 ? "tBNB" : "ETH") : "TOKEN");
  const bucketWei = claim && bucketSizes.length > claim.bucketIdx ? bucketSizes[claim.bucketIdx] : undefined;
  const bucketHumanAmount = bucketWei != null ? formatUnits(bucketWei, displayDecimals) : undefined;

  const onChainDepositEpoch = commitmentState
    ? Number((commitmentState as readonly [bigint, boolean])[0])
    : undefined;
  const onChainSpent = commitmentState
    ? (commitmentState as readonly [bigint, boolean])[1]
    : undefined;
  const onChainExists = onChainDepositEpoch !== undefined && onChainDepositEpoch > 0;

  // Track when the page first mounted so we can distinguish "freshly opened,
  // still waiting for chain to index a recent commit" from "truly unknown".
  // A recent commit tx may take 5-30s to appear in the contract state via the
  // RPC we're reading from. During that window we show "indexing…" instead of
  // panicking with "Commitment not found on chain".
  const [mountedAt] = useState<number>(() => Date.now());
  const INDEXING_GRACE_MS = 45_000;
  const stillIndexing = Date.now() - mountedAt < INDEXING_GRACE_MS;

  // Derived UI state (computed every render — cheap)
  type ClaimState = "no-claim" | "loading" | "wrong-chain" | "indexing" | "unknown" | "already-spent" | "wait" | "eligible";
  const claimState: ClaimState = (() => {
    if (!claim) return "no-claim";
    if (!isOnRightChain) return "wrong-chain";
    if (loadingCommitment || commitmentState === undefined) return "loading";
    if (!onChainExists) return stillIndexing ? "indexing" : "unknown";
    if (onChainSpent) return "already-spent";
    if (currentEpoch !== undefined && currentEpoch > (onChainDepositEpoch as number)) return "eligible";
    return "wait";
  })();

  // Countdown tick — runs only while waiting; stable hooks order regardless.
  useEffect(() => {
    if (claimState !== "wait") return;
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, [claimState]);

  // Pool feature gate — refuse to render the claim flow if the build has
  // VITE_ENABLE_POOL=false. Stays parallel to PoolView's same gate.
  if (!WEB3_CONFIG.ENABLE_POOL) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
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
        <Card className="p-6 bg-gradient-card backdrop-blur border-red-500/30">
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

  // Derived values used in render (only safe to compute past the !claim early return).
  const chainInfo = CHAIN_NAMES[claim.chainId];
  const canClaim = isConnected && claimState === "eligible" && !isRevealing;
  const eligibleEpoch = onChainDepositEpoch !== undefined ? onChainDepositEpoch + 1 : undefined;
  const eligibleAtMs = eligibleEpoch !== undefined ? eligibleEpoch * 3600 * 1000 : undefined;
  const msUntil = eligibleAtMs !== undefined ? eligibleAtMs - Date.now() : undefined;

  const handleClaim = async () => {
    if (!canClaim) return;
    setResult(null);
    // Same 3-step session shape as the depositor-side Notebook reveal
    // — the recipient gets identical lifecycle feedback. App-level
    // ProgressFlow renders this as a centered modal; if the user
    // already has an in-flight Bank8 tx, it stacks as a chip.
    const displayAmount = bucketHumanAmount
      ? `${bucketHumanAmount} ${displaySymbol}`
      : `bucket ${claim.bucketIdx}`;
    const sessionId = startProgress(`Claim · ${displayAmount}`, [
      { label: 'Sign in wallet',     status: 'running', detail: `Preparing claim of ${displayAmount}…` },
      { label: 'Confirm on-chain',   status: 'pending' },
      { label: 'Finalize & refresh', status: 'pending' },
    ]);
    try {
      const { txHash } = await revealFromURL(
        window.location.href,
        (steps) => updateProgress(sessionId, steps),
      );
      setResult({ txHash });
      // Refresh the on-chain commitment state — should now read spent=true.
      // Without this, the button would show "Claim" again until next refetch.
      refetchCommitment();
    } catch (e) {
      // lastError captured by the hook AND the lifecycle step is
      // already marked failed via the onProgress callback.
    }
  };

  const formatCountdown = (ms: number): string => {
    if (ms <= 0) return "eligible now";
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1_000);
    if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    return `${minutes}m ${seconds}s`;
  };

  const isNative = claim.token === "0x0000000000000000000000000000000000000000";
  const nativeSymbol = claim.chainId === 97 ? "tBNB" : "ETH";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
      </Button>

      <Card className="p-4 bg-gradient-card backdrop-blur border-vault-primary/30">
        <WalletConnector />
      </Card>

      {/* Header */}
      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-full bg-vault-primary/15">
            <Lock className="w-5 h-5 text-vault-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Pool Claim</h1>
            <p className="text-xs text-muted-foreground">
              {bucketHumanAmount
                ? <>You can claim <span className="text-foreground font-semibold">{bucketHumanAmount} {displaySymbol}</span> to <span className="font-mono">{claim.withdrawTo.slice(0, 8)}…{claim.withdrawTo.slice(-6)}</span></>
                : <>A CyrusTeleport commit is waiting to be revealed to <span className="font-mono">{claim.withdrawTo.slice(0, 8)}…{claim.withdrawTo.slice(-6)}</span></>}
            </p>
          </div>
        </div>
      </Card>

      {/* Claim details */}
      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-4">
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
                  className="hover:text-vault-primary inline-flex items-center gap-1"
                >
                  {claim.token.slice(0, 8)}…{claim.token.slice(-6)} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Amount:</span>
            <span>
              {bucketHumanAmount
                ? `${bucketHumanAmount} ${displaySymbol}`
                : `bucket ${claim.bucketIdx} (loading…)`}
            </span>
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
              className="hover:text-vault-primary inline-flex items-center gap-1"
            >
              {claim.contractAddress.slice(0, 8)}…{claim.contractAddress.slice(-6)} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex justify-between gap-4 pt-2 border-t border-vault-primary/15">
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

      {/* Action — state-aware. The button text + enabled status reflect the
          on-chain commitment state, NOT just wallet connection. Prevents
          users from paying gas on a "commitment already spent" revert. */}
      {claimState === "already-spent" ? (
        <Card className="p-6 bg-emerald-500/5 border-emerald-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-5 h-5 text-emerald-400" />
            <p className="font-semibold text-emerald-200">Already claimed</p>
          </div>
          <p className="text-sm text-muted-foreground">
            This commitment has been revealed. The bucket was paid to the recipient address shown above.
            No further action needed.
          </p>
          {chainInfo && (
            <a
              href={`${chainInfo.explorer}/address/${claim.contractAddress}`}
              target="_blank" rel="noreferrer noopener"
              className="inline-flex items-center gap-1 mt-3 text-xs text-vault-primary hover:underline font-mono"
            >
              View contract events <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </Card>
      ) : claimState === "indexing" ? (
        <Card className="p-6 bg-yellow-500/5 border-yellow-500/30">
          <div className="flex items-start gap-2">
            <Clock className="w-5 h-5 text-yellow-500 mt-0.5 animate-pulse" />
            <div>
              <p className="font-medium text-yellow-200">Checking on-chain state…</p>
              <p className="text-xs text-muted-foreground mt-1">
                If you just submitted the commit, it can take 5–30 seconds for the RPC to index it.
                This page auto-refreshes every 15s. If after a minute the commitment still doesn't
                appear, it means the URL was tampered with, the tx was reverted, or you're pointed
                at the wrong contract / chain.
              </p>
              <button
                type="button"
                onClick={() => refetchCommitment()}
                className="mt-2 text-xs text-yellow-300 hover:text-yellow-100 underline"
              >
                Check now
              </button>
            </div>
          </div>
        </Card>
      ) : claimState === "unknown" ? (
        <Card className="p-6 bg-red-500/5 border-red-500/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <p className="font-medium text-red-200">Commitment not found on chain</p>
              <p className="text-xs text-muted-foreground mt-1">
                The URL decoded successfully but the contract has no record of this commitment.
                Possible causes: the URL was tampered with, the commit tx was reverted, or you're
                pointed at the wrong contract / chain.
              </p>
              <button
                type="button"
                onClick={() => refetchCommitment()}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
              >
                Refresh
              </button>
            </div>
          </div>
        </Card>
      ) : claimState === "wait" ? (
        <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
          <div className="flex items-center gap-2 mb-3">
            <Check className="w-5 h-5 text-emerald-400" />
            <p className="font-semibold text-emerald-200">Payment confirmed on-chain</p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              <span className="text-foreground font-medium">Funds locked in the pool</span> — they can't
              be reversed, redirected, or stolen. The recipient address (above) is the only one that
              can receive them.
            </p>
            <p className="text-muted-foreground">
              Claim available in <span className="font-mono text-vault-primary font-medium">{msUntil !== undefined ? formatCountdown(msUntil) : "…"}</span>
              {eligibleAtMs !== undefined && (
                <> · {new Date(eligibleAtMs).toLocaleString()}</>
              )}.
            </p>
            <p className="text-xs text-muted-foreground/70 pt-1">
              The 1-hour wait is the anonymity mechanism — it lets your transaction blend into a
              cohort of other commits in the same epoch + bucket. The wait is normal and the funds
              are safe.
            </p>
          </div>
          <Button disabled className="w-full bg-vault-primary text-background hover:bg-vault-primary/90 mt-3 opacity-60">
            Wait {msUntil !== undefined ? formatCountdown(msUntil) : "…"}
          </Button>
        </Card>
      ) : (
        <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
          <Button onClick={handleClaim} disabled={!canClaim} className="w-full bg-vault-primary text-background hover:bg-vault-primary/90">
            {isRevealing
              ? "Claiming…"
              : claimState === "loading"
                ? "Checking commitment on chain…"
                : !isConnected
                  ? "Connect wallet first"
                  : claimState === "wrong-chain"
                    ? `Switch to ${chainInfo?.display ?? `chainId ${claim.chainId}`}`
                    : "Claim"}
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            You ({account ? <span className="font-mono">{account.slice(0, 8)}…{account.slice(-6)}</span> : "connected wallet"})
            will pay the gas. The bucket value goes to <span className="font-mono">{claim.withdrawTo.slice(0, 8)}…{claim.withdrawTo.slice(-6)}</span>
            {" "}— even if that's not you.
          </p>
        </Card>
      )}

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
              className="inline-flex items-center gap-1 text-xs text-vault-primary hover:underline font-mono"
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
