/**
 * PoolView — v2 anonymity-pool mode for cyrusthegreat.dev.
 *
 * This is the F.4a STUB. Renders a placeholder card explaining what
 * the mode is + an honest privacy disclaimer. Real commit/reveal UI
 * arrives in F.4c (CommitForm) and F.4d (Notebook).
 *
 * Design: matches the existing VaultCore Card aesthetic (dark
 * background, subtle border, royal/empire copy). NO new color palette
 * or fonts introduced.
 */

import { Card } from "@/components/ui/card";
import { Lock, AlertTriangle, Construction } from "lucide-react";
import { WEB3_CONFIG } from "@/config/web3";

interface PoolViewProps {
  activeChain: 'ETH' | 'BSC' | 'BASE';
}

const contractAddressFor = (chain: 'ETH' | 'BSC' | 'BASE'): string | undefined => {
  if (chain === 'ETH') return WEB3_CONFIG.CTGTRESOR_ETH_CONTRACT;
  if (chain === 'BSC') return WEB3_CONFIG.CTGTRESOR_BSC_CONTRACT;
  if (chain === 'BASE') return WEB3_CONFIG.CTGTRESOR_BASE_CONTRACT;
  return undefined;
};

export const PoolView = ({ activeChain }: PoolViewProps) => {
  const contractAddress = contractAddressFor(activeChain);
  const isDeployed = contractAddress && contractAddress !== 'notdeployednow' && contractAddress.startsWith('0x');

  return (
    <div className="w-full max-w-2xl mx-auto px-4 space-y-4">
      {/* Header card — mirrors the Secure Vault hero in VaultCore */}
      <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-full bg-primary/10">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Anonymity Pool</h2>
            <p className="text-xs text-muted-foreground">CyrusTresor1 · time-windowed batching · per-bucket commitments</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Opt-in privacy mode. Deposits go into a fixed-bucket pool with 1-hour epochs;
          withdrawals to any address you specify, claimable after the epoch boundary.
          The recipient can be yourself (self-pay) or someone else (teleport).
        </p>
      </Card>

      {/* Honest privacy disclaimer — non-negotiable per docs/cyrustresor1_spec.md § 2 */}
      <Card className="p-4 bg-yellow-500/5 border-yellow-500/30">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-yellow-200">Privacy disclaimer — read before depositing</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This pool provides <span className="font-medium text-foreground">k-anonymity within an
              epoch+bucket cohort</span> — convenient privacy against casual block-explorer watchers, but
              <span className="font-medium text-foreground"> not cryptographic anonymity</span>. A
              determined chain analyst can still link your commit transaction to your reveal transaction
              by computing the commitment hash on-chain. A v2 ZK-shielded upgrade is in development for
              real cryptographic anonymity. Do not use for value you cannot afford to have de-anonymized.
            </p>
          </div>
        </div>
      </Card>

      {/* Stub — actual commit/reveal UI lands in F.4c / F.4d */}
      <Card className="p-6 bg-card/80 backdrop-blur border-border/50">
        <div className="flex items-center gap-3 mb-3">
          <Construction className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold">Commit / Reveal UI — coming next</h3>
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            The next scaffold commit (F.4c) adds the commit form: bucket picker, withdrawTo input,
            and a "Generate claim URL" flow you can share with a recipient via Signal / QR / email.
          </p>
          <p>
            After that (F.4d): a notebook panel listing your pending commits + reveal buttons that
            unlock once the epoch boundary passes.
          </p>
        </div>
        <div className="mt-4 pt-4 border-t border-border/40 text-xs space-y-1.5 font-mono">
          <div className="text-muted-foreground">Active chain: <span className="text-foreground">{activeChain}</span></div>
          <div className="text-muted-foreground">
            CyrusTresor1: <span className={isDeployed ? "text-foreground" : "text-yellow-500"}>
              {isDeployed ? contractAddress : `not deployed on ${activeChain} mainnet (testnet only for now)`}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};
