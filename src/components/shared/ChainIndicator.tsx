/**
 * ChainIndicator - Focused component for chain switching and status display
 * Extracted from the monolithic VaultCore component
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getChainConfig } from "@/config/web3";
import { useAccount } from "wagmi";

interface ChainIndicatorProps {
  activeChain: 'ETH' | 'BSC' | 'BASE';
  setActiveChain: (chain: 'ETH' | 'BSC' | 'BASE') => void;
  isSwitchingNetwork?: boolean;
}

export function ChainIndicator({
  activeChain,
  setActiveChain,
  isSwitchingNetwork = false
}: ChainIndicatorProps) {
  const { isConnected } = useAccount();
  const chainConfig = getChainConfig(activeChain);

  const chains = [
    { id: 'ETH' as const, name: 'Ethereum', color: 'bg-blue-500' },
    { id: 'BSC' as const, name: 'BSC', color: 'bg-yellow-500' },
    { id: 'BASE' as const, name: 'Base', color: 'bg-purple-500' }
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Network</h3>
          <Badge variant="secondary" className={chainConfig.color}>
            {chainConfig.name}
          </Badge>
        </div>

        <div className="flex gap-2">
          {chains.map((chain) => (
            <Button
              key={chain.id}
              variant={activeChain === chain.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveChain(chain.id)}
              disabled={!isConnected || isSwitchingNetwork}
              className="min-w-[60px]"
            >
              {chain.name}
            </Button>
          ))}
        </div>
      </div>

      {isSwitchingNetwork && (
        <div className="mt-2 text-sm text-muted-foreground">
          Switching networks...
        </div>
      )}
    </Card>
  );
}
