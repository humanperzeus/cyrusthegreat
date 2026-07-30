/**
 * /discover — public directory of opted-in fundraising campaigns.
 *
 * Reads getListedCampaigns() from CyrusFundraise in ONE eth_call (ids +
 * structs, incl. on-chain title + raised) — no getLogs, no backend. Only
 * campaigns whose owner checked "list publicly" appear. Each card links to
 * /fund?id=N (which reads the same on-chain money-truth). Live raised totals
 * refresh every 30s via the hook's poll.
 */

import { useNavigate } from "react-router-dom";
import { useSeo } from "@/hooks/useSeo";
import { useChainId } from "wagmi";
import { formatUnits, type Address } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, HeartHandshake, Compass, Loader2, TrendingUp } from "lucide-react";
import { WEB3_CONFIG } from "@/config/web3";
import { WalletStatusChip } from "@/components/shared/WalletStatusChip";
import { POOL_TOKENS_BY_CHAIN } from "@/hooks/usePool";
import { useListedCampaigns, fundraiseAddressForChain, type ListedCampaign } from "@/hooks/useFundraise";

const CampaignCard = ({ c }: { c: ListedCampaign }) => {
  const navigate = useNavigate();
  const chainId = useChainId();
  const tokens = POOL_TOKENS_BY_CHAIN[chainId] ?? POOL_TOKENS_BY_CHAIN[11155111] ?? [];
  const tokenEntry = tokens.find(t => t.address.toLowerCase() === c.token.toLowerCase());
  const symbol = tokenEntry?.symbol ?? "token";
  const decimals = tokenEntry?.decimals ?? 18;

  const raised = formatUnits(c.raised, decimals);
  const goal = c.goal > 0n ? formatUnits(c.goal, decimals) : "";
  const pct = c.goal > 0n ? Math.min(100, Number((c.raised * 100n) / c.goal)) : null;

  return (
    <Card className="p-5 bg-gradient-card backdrop-blur border-vault-primary/30 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-full bg-vault-primary/15">
          <HeartHandshake className="w-4 h-4 text-vault-primary" />
        </div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Campaign #{c.id}{!c.active && " · closed"}</p>
      </div>
      <h3 className="text-base font-semibold leading-snug line-clamp-2">{c.title || `Campaign #${c.id}`}</h3>

      <div className="mt-auto space-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-vault-primary" />
          <span className="text-lg font-mono text-vault-primary">{raised} {symbol}</span>
          {goal && <span className="text-xs text-muted-foreground">/ {goal}</span>}
        </div>
        {pct !== null && (
          <div className="h-1.5 w-full bg-vault-primary/10 rounded-full overflow-hidden">
            <div className="h-full bg-vault-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/60 font-mono">to {c.recipient.slice(0, 6)}…{c.recipient.slice(-4)}</p>
      </div>

      <Button
        onClick={() => navigate(`/fund?id=${c.id}&title=${encodeURIComponent(c.title)}`)}
        disabled={!c.active}
        className="w-full bg-vault-primary text-background hover:bg-vault-primary/90 text-sm"
      >
        {c.active ? "Donate →" : "Closed"}
      </Button>
    </Card>
  );
};

const Discover = () => {
  useSeo({
    title: "Discover crypto fundraisers — cyrusthegreat.dev",
    description: "Browse live non-custodial crypto fundraising campaigns with on-chain progress on cyrusthegreat.dev.",
    path: "/discover",
  });
  const navigate = useNavigate();
  const chainId = useChainId();
  const { campaigns, isLoading } = useListedCampaigns();
  const contractHere = !!fundraiseAddressForChain(chainId);

  if (!WEB3_CONFIG.ENABLE_POOL) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
          <h1 className="text-xl font-bold mb-2">Discover unavailable</h1>
          <p className="text-sm text-muted-foreground">The fundraising feature isn't enabled on this build.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
        </Button>
        <WalletStatusChip />
      </div>

      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-full bg-vault-primary/15">
            <Compass className="w-5 h-5 text-vault-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Discover campaigns</h1>
            <p className="text-xs text-muted-foreground">Public fundraisers, live on-chain. Anyone can donate.</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          These campaigns opted into the public directory. Totals are read straight from the fundraise
          contract — exact and live. Want your own listed here? <a href="/fundraise" className="text-vault-primary hover:underline">Create a campaign</a> and check "list publicly".
        </p>
      </Card>

      {!contractHere ? (
        <Card className="p-6 bg-yellow-500/5 border-yellow-500/30">
          <p className="text-sm text-yellow-200">The directory lives on Sepolia. Switch your wallet to Sepolia to browse listed campaigns.</p>
        </Card>
      ) : isLoading && campaigns.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading campaigns…
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="p-8 bg-gradient-card backdrop-blur border-vault-primary/30 text-center space-y-2">
          <Compass className="w-8 h-8 text-vault-primary/50 mx-auto" />
          <p className="text-sm text-muted-foreground">No public campaigns yet.</p>
          <p className="text-xs text-muted-foreground/70">
            Be the first — <a href="/fundraise" className="text-vault-primary hover:underline">create a campaign</a> and check "list publicly".
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {campaigns.map((c) => <CampaignCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
};

export default Discover;
