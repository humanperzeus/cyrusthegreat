/**
 * /pay — anonymous P2P payment surface.
 *
 * Sibling to Index.tsx (v1 + v2) and Claim.tsx (recipient-side). Standalone
 * route so it can be linked directly ("cyrusthegreat.dev/pay") without
 * forcing the user through the v1/v2 selection.
 *
 * Self-managed chain state — Index.tsx's activeChain doesn't reach here.
 * Defaults to ETH (Sepolia in testnet mode). User flips chains via the
 * ChainSwitcher at the top, same as PoolView's pattern.
 *
 * The pool feature flag (WEB3_CONFIG.ENABLE_POOL) gates this route too —
 * if disabled, render the same "feature disabled" message as Claim does.
 * /pay reuses CyrusTeleport's commit primitive end-to-end, so it's a
 * no-go when the pool is off.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, ChevronLeft } from "lucide-react";
import { WEB3_CONFIG } from "@/config/web3";
import { PayForm } from "@/components/pay/PayForm";
import { ChainSwitcher } from "@/components/pool/ChainSwitcher";
import { WalletConnector } from "@/components/WalletConnector";

type ChainTag = "ETH" | "BSC" | "BASE" | "HYPER" | "ARB";

const Pay = () => {
  const navigate = useNavigate();
  const [activeChain, setActiveChain] = useState<ChainTag>("ETH");

  if (!WEB3_CONFIG.ENABLE_POOL) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
          <h1 className="text-xl font-bold mb-2">Payments not available</h1>
          <p className="text-sm text-muted-foreground">
            The privacy-payment feature isn't enabled on this build. Contact the operator.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
      </Button>

      {/* Wallet connect strip — visible on standalone pages so user
          can connect without bouncing back to the v1 home. Component
          renders compact-connected (address + disconnect) OR full
          connect buttons depending on state. */}
      <Card className="p-4 bg-gradient-card backdrop-blur border-vault-primary/30">
        <WalletConnector />
      </Card>

      <div className="flex justify-center pt-2">
        <ChainSwitcher activeChain={activeChain} setActiveChain={setActiveChain} />
      </div>

      {/* Header card — short, no jargon, payment-themed */}
      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-full bg-vault-primary/15">
            <Send className="w-5 h-5 text-vault-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Anonymous payments</h1>
            <p className="text-xs text-muted-foreground">Pay anyone — no public link between you and them</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          You pay → funds enter a shared pool → recipient claims via a shareable receipt URL. ~1 hour
          settlement. Powered by CyrusTeleport (commit-reveal anonymity pool).
        </p>
      </Card>

      {/* Honest privacy note — same trimmed version as PoolView */}
      <Card className="p-4 bg-yellow-500/5 border-yellow-500/30">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-yellow-200">Cohort-based privacy, not cryptographic.</span> A
          determined chain analyst can still link your payment to the claim via the public commitment
          hash. Don't use for high-value or sensitive transactions.
        </p>
      </Card>

      <PayForm activeChain={activeChain} />
    </div>
  );
};

export default Pay;
