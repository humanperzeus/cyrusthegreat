/**
 * /fund — donor-facing campaign page.
 *
 * Two URL shapes:
 *
 *  A) CONTRACT campaign (new, preferred):
 *       ?id=42&title=…&desc=…&anon=…
 *     The money-truth (recipient, token, goal, raised) is read from the
 *     CyrusFundraise contract via useCampaign(id) — an EXACT live progress
 *     bar in a single eth_call, no getLogs. Public donations go through
 *     donate(id) (0.1%/$0.10 fee auto-split). title/desc ride in the URL
 *     (cheap display; not stored on-chain).
 *
 *  B) LEGACY campaign (old links still work):
 *       ?to=0xWallet&title=…&desc=…&goal=…&token=USD1&anon=…
 *     Public donations are a plain ERC-20 transfer (no fee, no on-chain
 *     campaign), and progress is a block-explorer link (we can't compute a
 *     per-campaign total for a bare address).
 *
 * Anonymous mode (both shapes) always uses the CyrusTeleport pool.
 */

import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useChainId } from "wagmi";
import { formatUnits, type Address } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, HeartHandshake, AlertTriangle, ExternalLink, Target, TrendingUp, Loader2 } from "lucide-react";
import { WEB3_CONFIG } from "@/config/web3";
import { DonateForm } from "@/components/fund/DonateForm";
import { AnonymousDonateForm } from "@/components/fund/AnonymousDonateForm";
import { WalletStatusChip } from "@/components/shared/WalletStatusChip";
import { POOL_TOKENS_BY_CHAIN } from "@/hooks/usePool";
import { useCampaign } from "@/hooks/useFundraise";

/** Block-explorer "token transfers for this address" URL — the honest
 *  progress source for LEGACY (bare-address) campaigns only. */
const explorerTokenTxUrl = (chainId: number, token: Address, recipient: Address): string => {
  const base =
    chainId === 11155111 ? "https://sepolia.etherscan.io"
    : chainId === 97      ? "https://testnet.bscscan.com"
    : chainId === 84532   ? "https://sepolia.basescan.org"
    : chainId === 421614  ? "https://sepolia.arbiscan.io"
    : null;
  if (!base) return "#";
  return `${base}/token/${token}?a=${recipient}`;
};

type AnonPolicy = 'optional' | 'required' | 'disabled';
type DonorMode = 'public' | 'anonymous';

const Fund = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ---- URL params -------------------------------------------------
  const idParam = searchParams.get("id");
  const idNum = idParam && /^\d+$/.test(idParam) ? parseInt(idParam, 10) : undefined;
  const contractMode = idNum != null;

  const title = searchParams.get("title") ?? "";
  const description = searchParams.get("desc") ?? "";
  const tokenSymbolFromUrl = searchParams.get("token") ?? "USD1";
  const anonPolicy: AnonPolicy = (() => {
    const raw = searchParams.get("anon");
    if (raw === 'required' || raw === 'disabled') return raw;
    return 'optional';
  })();

  // ---- on-chain campaign (contract mode) --------------------------
  const { campaign, isLoading: campaignLoading, refetch } = useCampaign(idNum);

  const walletChainId = useChainId();
  const chainForTokens = walletChainId ?? 11155111;
  const availableTokens = POOL_TOKENS_BY_CHAIN[chainForTokens] ?? POOL_TOKENS_BY_CHAIN[11155111] ?? [];

  // Resolve the token entry: contract mode by the campaign's token ADDRESS,
  // legacy mode by the URL symbol.
  const tokenEntry = useMemo(() => {
    if (contractMode) {
      if (!campaign) return undefined;
      return availableTokens.find(t => t.address.toLowerCase() === campaign.token.toLowerCase());
    }
    return availableTokens.find(t => t.symbol.toLowerCase() === tokenSymbolFromUrl.toLowerCase());
  }, [contractMode, campaign, availableTokens, tokenSymbolFromUrl]);

  const tokenSymbol = tokenEntry?.symbol ?? tokenSymbolFromUrl;
  const tokenDecimals = tokenEntry?.decimals ?? 18;
  const tokenAddress = (contractMode ? campaign?.token : tokenEntry?.address) as Address | undefined;

  // Effective recipient + goal + raised (source depends on mode).
  const recipient = contractMode ? (campaign?.recipient ?? "") : (searchParams.get("to") ?? "");
  const recipientValid = /^0x[a-fA-F0-9]{40}$/.test(recipient);
  const goalDisplay = contractMode
    ? (campaign && campaign.goal > 0n ? formatUnits(campaign.goal, tokenDecimals) : "")
    : (searchParams.get("goal") ?? "");
  const raisedDisplay = contractMode && campaign ? formatUnits(campaign.raised, tokenDecimals) : null;
  const progressPercent = contractMode && campaign && campaign.goal > 0n
    ? Math.min(100, Number((campaign.raised * 100n) / campaign.goal))
    : null;

  const displayTitle = title.trim().length > 0 ? title : (contractMode ? `Campaign #${idNum}` : "");

  const [donorMode, setDonorMode] = useState<DonorMode>(
    anonPolicy === 'required' ? 'anonymous' : 'public',
  );

  // ---- guards -----------------------------------------------------
  if (!WEB3_CONFIG.ENABLE_POOL) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
          <h1 className="text-xl font-bold mb-2">Fundraising unavailable</h1>
          <p className="text-sm text-muted-foreground">The privacy-payment feature isn't enabled on this build.</p>
        </Card>
      </div>
    );
  }

  // Contract mode: loading + not-found states.
  if (contractMode && campaignLoading && !campaign) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading campaign #{idNum}…
      </div>
    );
  }
  const invalid = contractMode ? !campaign : (!recipientValid || title.trim().length === 0);
  if (invalid) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
        </Button>
        <Card className="p-6 bg-gradient-card backdrop-blur border-red-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <h1 className="text-lg font-semibold mb-2">{contractMode ? "Campaign not found" : "Invalid campaign URL"}</h1>
              <p className="text-sm text-muted-foreground">
                {contractMode
                  ? `No campaign with id ${idNum} exists on this chain. Make sure your wallet is on the same network the campaign was created on (Sepolia).`
                  : (!recipientValid
                      ? "Missing or invalid recipient wallet address (?to= parameter)."
                      : "Missing campaign title (?title= parameter).")}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Want to create a campaign? <a href="/fundraise" className="text-vault-primary hover:underline">Start here →</a>
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const showModePicker = anonPolicy === 'optional';
  const closed = contractMode && campaign ? !campaign.active : false;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
        </Button>
        <WalletStatusChip />
      </div>

      {/* Campaign hero */}
      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-vault-primary/15">
            <HeartHandshake className="w-5 h-5 text-vault-primary" />
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Fundraising campaign{contractMode ? ` · #${idNum}` : ""}
          </p>
        </div>
        <h1 className="text-2xl font-bold mb-3">{displayTitle}</h1>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{description}</p>
        )}

        {/* Progress: contract mode = EXACT raised (raisedOf via one eth_call).
            Legacy = block-explorer link (can't attribute a bare address). */}
        {contractMode ? (
          <div className="bg-vault-primary/5 border border-vault-primary/20 rounded-md px-3 py-3 mb-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-vault-primary" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Raised so far</p>
              {campaignLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/50" />}
            </div>
            <p className="text-2xl font-mono text-vault-primary">
              {raisedDisplay} {tokenSymbol}
              {goalDisplay && <span className="text-sm text-muted-foreground ml-2">/ {goalDisplay} {tokenSymbol}</span>}
            </p>
            {progressPercent !== null && (
              <>
                <div className="h-2 w-full bg-vault-primary/10 rounded-full overflow-hidden">
                  <div className="h-full bg-vault-primary transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground/70 text-right">{progressPercent}% of goal</p>
              </>
            )}
            <p className="text-[9px] text-muted-foreground/50 leading-relaxed pt-1">
              Exact on-chain total from the campaign contract. Updates every 30s. (Anonymous pool donations settle separately.)
            </p>
          </div>
        ) : (
          <div className="bg-vault-primary/5 border border-vault-primary/20 rounded-md px-3 py-3 mb-4 space-y-2">
            {goalDisplay && (
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-vault-primary" />
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Goal</p>
                <p className="text-sm font-mono text-vault-primary ml-auto">{goalDisplay} {tokenSymbol}</p>
              </div>
            )}
            {tokenAddress && recipientValid && (
              <a
                href={explorerTokenTxUrl(chainForTokens, tokenAddress, recipient as Address)}
                target="_blank" rel="noreferrer noopener"
                className="text-xs text-vault-primary hover:underline inline-flex items-center gap-1"
              >
                View live donations on the block explorer <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <p className="text-[9px] text-muted-foreground/50 leading-relaxed">
              Legacy campaign — the explorer shows every {tokenSymbol} transfer to this wallet (the ground truth).
            </p>
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p><span className="text-foreground">Funds go to:</span> <code className="font-mono text-[10px]">{recipient.slice(0, 8)}…{recipient.slice(-6)}</code></p>
          <p><span className="text-foreground">Token:</span> {tokenSymbol}</p>
        </div>
      </Card>

      {closed ? (
        <Card className="p-4 bg-yellow-500/5 border-yellow-500/30">
          <p className="text-sm text-yellow-200">This campaign has been closed by its owner — no further donations are accepted.</p>
        </Card>
      ) : (
        <>
          {/* Mode picker — Public (default) vs Anonymous */}
          {showModePicker && (
            <Card className="p-4 bg-gradient-card backdrop-blur border-vault-primary/30">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Choose how to donate</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDonorMode('public')}
                  className={`text-left rounded-md p-3 border-2 transition-colors ${
                    donorMode === 'public' ? 'border-vault-primary bg-vault-primary/15' : 'border-vault-primary/15 bg-vault-primary/5 hover:border-vault-primary/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium ${donorMode === 'public' ? 'text-vault-primary' : 'text-foreground'}`}>Public</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-200 px-1.5 py-0.5 rounded">Recommended</span>
                  </div>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5 leading-relaxed list-disc pl-4">
                    <li>Instant settlement</li>
                    <li>Recipient always gets funds</li>
                    <li>Your address visible on chain</li>
                  </ul>
                </button>
                <button
                  type="button"
                  onClick={() => setDonorMode('anonymous')}
                  className={`text-left rounded-md p-3 border-2 transition-colors ${
                    donorMode === 'anonymous' ? 'border-vault-primary bg-vault-primary/15' : 'border-vault-primary/15 bg-vault-primary/5 hover:border-vault-primary/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium ${donorMode === 'anonymous' ? 'text-vault-primary' : 'text-foreground'}`}>Anonymous</span>
                    <span className="text-[10px] bg-yellow-500/20 text-yellow-200 px-1.5 py-0.5 rounded">You must claim</span>
                  </div>
                  <ul className="text-[11px] text-muted-foreground space-y-0.5 leading-relaxed list-disc pl-4">
                    <li>~1 hour settlement</li>
                    <li>You must save QR + return to claim</li>
                    <li>Your address NOT visible</li>
                  </ul>
                </button>
              </div>
            </Card>
          )}

          {/* Donate form — contract mode passes campaignId so donations go
              through donate(id) with the fee split + live total refresh. */}
          {donorMode === 'public' ? (
            <DonateForm
              recipient={recipient as Address}
              tokenSymbol={tokenSymbol}
              campaignId={contractMode ? idNum : undefined}
              onDonated={contractMode ? refetch : undefined}
            />
          ) : (
            <AnonymousDonateForm
              recipient={recipient as Address}
              tokenSymbol={tokenSymbol}
              campaignTitle={displayTitle}
            />
          )}
        </>
      )}

      {/* Share */}
      <Card className="p-4 bg-vault-primary/5 border-vault-primary/15">
        <p className="text-xs text-muted-foreground">
          💡 Share this campaign URL anywhere. {contractMode
            ? "Public donations go through the campaign contract (0.1% fee, min $0.10); the rest reaches the wallet above."
            : "Donations reach the wallet above directly."} No signup required beyond connecting a wallet.
        </p>
      </Card>
    </div>
  );
};

export default Fund;
