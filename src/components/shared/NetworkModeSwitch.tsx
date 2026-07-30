/**
 * NetworkModeSwitch — small testnet/mainnet toggle, Imperial Gold skin.
 *
 * Mirrors the v1/v2 Tabs styling but sits ABOVE them so it's clear the
 * network-mode choice gates which chain set + contract addresses the
 * v1/v2 view operates on.
 *
 * Clicking the inactive option calls setNetworkMode() which persists
 * to localStorage and reloads the page — the simplest way to re-
 * evaluate every WEB3_CONFIG consumer (contract addresses, RPC URLs,
 * wagmi config) without refactoring the dapp to read mode as reactive
 * state.
 *
 * When mainnet is picked but no mainnet contracts are deployed (see
 * isMainnetDeployedAnywhere() in web3.ts), App.tsx renders the
 * MainnetComingSoon guard INSTEAD of the normal routes — so the
 * switch is allowed to flip even before mainnet exists; the guard is
 * what protects the user from broken state.
 */

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Beaker, Globe2 } from "lucide-react";
import { getEffectiveNetworkMode, setNetworkMode } from "@/config/web3";

export const NetworkModeSwitch = () => {
  const current = getEffectiveNetworkMode();

  return (
    <div className="w-full pt-3 pb-1 flex justify-center">
      <Tabs value={current} onValueChange={(v) => {
        if (v === current) return; // no-op on same-tab click; avoids needless reload
        if (v === "mainnet" || v === "testnet") setNetworkMode(v);
      }}>
        <TabsList className="bg-gradient-card backdrop-blur border border-vault-primary/30 h-8">
          <TabsTrigger
            value="testnet"
            className="gap-1.5 px-3 text-xs h-6 data-[state=active]:bg-vault-primary/20 data-[state=active]:text-vault-primary"
          >
            <Beaker className="w-3.5 h-3.5" />
            <span>Testnet</span>
          </TabsTrigger>
          <TabsTrigger
            value="mainnet"
            className="gap-1.5 px-3 text-xs h-6 data-[state=active]:bg-vault-primary/20 data-[state=active]:text-vault-primary"
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>Mainnet</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
};
