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
import { Lock, AlertTriangle } from "lucide-react";
import { WEB3_CONFIG } from "@/config/web3";
import { CommitForm } from "@/components/pool/CommitForm";
import { Notebook } from "@/components/pool/Notebook";
import { ChainSwitcher } from "@/components/pool/ChainSwitcher";

interface PoolViewProps {
  activeChain: 'ETH' | 'BSC' | 'BASE' | 'HYPER' | 'ARB';
  setActiveChain: (chain: 'ETH' | 'BSC' | 'BASE' | 'HYPER' | 'ARB') => void;
}

const contractAddressFor = (chain: 'ETH' | 'BSC' | 'BASE' | 'HYPER' | 'ARB'): string | undefined => {
  if (chain === 'ETH') return WEB3_CONFIG.CTGTRESOR_ETH_CONTRACT;
  if (chain === 'BSC') return WEB3_CONFIG.CTGTRESOR_BSC_CONTRACT;
  if (chain === 'BASE') return WEB3_CONFIG.CTGTRESOR_BASE_CONTRACT;
  if (chain === 'HYPER') return WEB3_CONFIG.CTGTRESOR_HYPER_CONTRACT;
  if (chain === 'ARB') return WEB3_CONFIG.CTGTRESOR_ARB_CONTRACT;
  return undefined;
};

export const PoolView = ({ activeChain, setActiveChain }: PoolViewProps) => {
  const contractAddress = contractAddressFor(activeChain);
  const isDeployed = contractAddress && contractAddress !== 'notdeployednow' && contractAddress.startsWith('0x');
  // unused for now — referenced once the address footer is removed; kept for future debug surface
  void isDeployed;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 space-y-4">
      {/* Chain switcher — same UX as v1's, kept inside v2 so users can change
          chain without leaving pool mode. Uses the shared switchToChain helper
          (wagmi-imperative since 2026-05-18 — works for WalletConnect/Reown too). */}
      <div className="flex justify-center pt-2">
        <ChainSwitcher activeChain={activeChain} setActiveChain={setActiveChain} />
      </div>

      {/* Header card — mirrors the Secure Vault hero in VaultCore */}
      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-full bg-vault-primary/15">
            <Lock className="w-5 h-5 text-vault-primary" />
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

      {/* Commit flow (F.4c). */}
      <CommitForm activeChain={activeChain} />

      {/* Notebook (F.4d) — depositor's pending + revealed commits. */}
      <Notebook activeChain={activeChain} />

      {/* Address debug footer — kept for now, useful for verifying which contract
          you're committing to. Remove once the dapp matures. */}
      <Card className="p-3 bg-gradient-card border-vault-primary/15 text-xs font-mono">
        <div className="text-muted-foreground">
          Active chain: <span className="text-foreground">{activeChain}</span>
          {" · "}
          CyrusTresor1: <span className="text-foreground">{contractAddress || "—"}</span>
        </div>
      </Card>
    </div>
  );
};
