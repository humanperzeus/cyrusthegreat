/**
 * ChainSwitcher — v2-side chain selector buttons, mirroring v1's visual.
 *
 * Mounted at the top of PoolView so users can switch between Sepolia / BSC
 * Testnet / Base Sepolia (or mainnet equivalents) without leaving v2 mode.
 *
 * Uses the same `switchToChain()` helper as v1 (now backed by wagmi's
 * imperative switchChain action — works for both injected wallets and
 * WalletConnect-relayed wallets like Rabby via Reown).
 *
 * SOL button is shown as disabled per the v1 convention — Solana program
 * exists but isn't wired into the EVM dapp yet.
 */

import { useState } from "react";
import { useChainId } from "wagmi";
import { switchToChain, WEB3_CONFIG } from "@/config/web3";

interface ChainSwitcherProps {
  activeChain: "ETH" | "BSC" | "BASE" | "HYPER";
  setActiveChain: (chain: "ETH" | "BSC" | "BASE" | "HYPER") => void;
}

// chainId → v1's chain-label mapping, so wagmi's chainId can drive
// the visual "active" state without needing prop drilling.
const chainIdToLabel = (chainId: number | undefined): "ETH" | "BSC" | "BASE" | "HYPER" | null => {
  if (chainId === 1 || chainId === 11155111) return "ETH";
  if (chainId === 56 || chainId === 97) return "BSC";
  if (chainId === 8453 || chainId === 84532) return "BASE";
  if (chainId === 999 || chainId === 998) return "HYPER";
  return null;
};

export const ChainSwitcher = ({ activeChain, setActiveChain }: ChainSwitcherProps) => {
  const walletChainId = useChainId();
  const walletChainLabel = chainIdToLabel(walletChainId);
  const isTestnet = WEB3_CONFIG.NETWORK_MODE !== "mainnet";
  const [isSwitching, setIsSwitching] = useState<"ETH" | "BSC" | "BASE" | "HYPER" | null>(null);

  // Source of truth: prop-driven activeChain (mirrors v1's pattern). Visual
  // is most accurate when this matches walletChainLabel — if they diverge,
  // wallet is on a different chain than what the dapp thinks.
  const effectiveActive = activeChain;

  const handleSwitch = async (target: "ETH" | "BSC" | "BASE" | "HYPER") => {
    if (isSwitching) return;
    setIsSwitching(target);
    try {
      const ok = await switchToChain(target);
      if (ok) setActiveChain(target);
    } finally {
      setIsSwitching(null);
    }
  };

  const buttonClass = (label: "ETH" | "BSC" | "BASE" | "HYPER") =>
    `w-10 h-8 px-1 flex items-center justify-center text-[10px] font-mono rounded cursor-pointer transition-all duration-200 ` +
    (effectiveActive === label
      ? "text-white bg-primary border border-primary"
      : "text-muted-foreground/60 bg-transparent border border-muted/30 hover:bg-background/20");

  const chainMismatch = walletChainLabel && walletChainLabel !== activeChain;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <button onClick={() => handleSwitch("ETH")} className={buttonClass("ETH")} title="Ethereum / Sepolia">
          {isSwitching === "ETH" ? "…" : (isTestnet ? "tETH" : "ETH")}
        </button>
        {/* BSC re-enabled 2026-05-30 (contracts redeployed). HYPER stays
            disabled until HyperEVM testnet faucet drips through. */}
        <button onClick={() => handleSwitch("BSC")} className={buttonClass("BSC")} title="BSC / BSC Testnet">
          {isSwitching === "BSC" ? "…" : (isTestnet ? "tBSC" : "BSC")}
        </button>
        <button onClick={() => handleSwitch("BASE")} className={buttonClass("BASE")} title="Base / Base Sepolia">
          {isSwitching === "BASE" ? "…" : (isTestnet ? "tBASE" : "BASE")}
        </button>
        <div
          className="w-10 h-8 flex items-center justify-center text-[10px] font-mono text-muted-foreground/40 bg-transparent border border-muted/30 rounded cursor-not-allowed"
          title="HyperEVM — pending faucet + redeploy"
        >
          {isTestnet ? "tHYPE" : "HYPE"}
        </div>
        <div
          className="w-10 h-8 flex items-center justify-center text-[10px] font-mono text-muted-foreground/40 bg-transparent border border-muted/30 rounded cursor-not-allowed"
          title="Solana — not yet integrated"
        >
          SOL
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground">
        Active: <span className="font-mono text-foreground">{activeChain}</span>
        {" · "}
        <span className="font-mono">{isTestnet ? "TESTNET" : "MAINNET"}</span>
        {chainMismatch && (
          <span className="ml-2 text-yellow-500">
            (wallet on {walletChainLabel} — click {activeChain} again to sync)
          </span>
        )}
      </div>
    </div>
  );
};
