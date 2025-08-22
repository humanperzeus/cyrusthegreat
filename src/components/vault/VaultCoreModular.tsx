/**
 * VaultCoreModular - Refactored VaultCore with modular components
 * This maintains the exact same UI while being much more maintainable
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletConnector } from "../WalletConnector";
import { useAccount } from "wagmi";
import { debugLog } from "@/lib/utils";

// Import our new modular components
import { BalanceDisplay } from "../shared/BalanceDisplay";
import { ChainIndicator } from "../shared/ChainIndicator";
// Import existing token components (we'll create these next)
import { TokenList } from "../tokens/TokenList";
import { OperationButtons } from "../operations/OperationButtons";

interface VaultCoreProps {
  walletBalance: string;
  vaultBalance: string;
  currentFee: string;
  isLoading: boolean;
  isSimulating?: boolean;
  isTransactionConfirmed?: boolean;
  // ETH operation handlers
  onDeposit: () => void;
  onWithdraw: () => void;
  onTransfer: () => void;
  // Token operation handlers
  onTokenDeposit: (token: { symbol: string; address: string; balance: string }) => void;
  onTokenWithdraw: (token: { symbol: string; address: string; balance: string }) => void;
  onTokenTransfer: (token: { symbol: string; address: string; balance: string }) => void;
  // Token display props
  walletTokens: Array<{address: string, symbol: string, balance: string, decimals: number}>;
  vaultTokens: Array<{address: string, symbol: string, balance: string, decimals: number}>;
  isLoadingWalletTokens: boolean;
  isLoadingVaultTokens: boolean;
  refetchWalletTokens: () => void;
  refetchVaultTokens: () => void;
  // Chain switching props
  activeChain: 'ETH' | 'BSC' | 'BASE';
  setActiveChain: (chain: 'ETH' | 'BSC' | 'BASE') => void;
  // Network state
  isSwitchingNetwork?: boolean;
}

// Keep the animated chain display logic (this was nice UX)
const useAnimatedChainDisplay = (isConnected: boolean) => {
  const [currentDisplayChain, setCurrentDisplayChain] = useState<'ETH' | 'BSC' | 'BASE'>('ETH');
  const [currentMessage, setCurrentMessage] = useState(0);

  const vaultMessages = [
    "Securing the royal vault...",
    "Protecting the empire's wealth...",
    "Guarding ancient secrets..."
  ];

  useEffect(() => {
    if (!isConnected) {
      const interval = setInterval(() => {
        setCurrentDisplayChain(prev => prev === 'ETH' ? 'BSC' : prev === 'BSC' ? 'BASE' : 'ETH');
        setCurrentMessage(prev => (prev + 1) % vaultMessages.length);
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [isConnected]);

  return { currentDisplayChain, currentMessage, vaultMessages };
};

export function VaultCoreModular({
  walletBalance,
  vaultBalance,
  currentFee,
  isLoading,
  isSimulating = false,
  isTransactionConfirmed = false,
  onDeposit,
  onWithdraw,
  onTransfer,
  onTokenDeposit,
  onTokenWithdraw,
  onTokenTransfer,
  walletTokens,
  vaultTokens,
  isLoadingWalletTokens,
  isLoadingVaultTokens,
  refetchWalletTokens,
  refetchVaultTokens,
  activeChain,
  setActiveChain,
  isSwitchingNetwork = false
}: VaultCoreProps) {
  const { isConnected } = useAccount();
  const { currentDisplayChain, currentMessage, vaultMessages } = useAnimatedChainDisplay(isConnected);

  // Essential logging only
  if (process.env.NODE_ENV === 'development') {
    debugLog('VaultCoreModular State:', {
      activeChain,
      isConnected,
      walletBalance,
      vaultBalance,
      walletTokens: walletTokens.length,
      vaultTokens: vaultTokens.length
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header Section - Keep the beautiful existing design */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              VaultWhisper
            </h1>
            <div className="absolute -top-2 -right-2 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>

        {!isConnected && (
          <div className="space-y-2">
            <p className="text-lg text-muted-foreground">
              {vaultMessages[currentMessage]}
            </p>
            <div className="flex justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                {currentDisplayChain === 'ETH' ? 'Ethereum' : currentDisplayChain === 'BSC' ? 'BSC' : 'Base'}
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                Secure & Private
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                Multi-Chain Ready
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Wallet Connection */}
      <WalletConnector />

      {/* Chain Indicator - New Modular Component */}
      {isConnected && (
        <ChainIndicator
          activeChain={activeChain}
          setActiveChain={setActiveChain}
          isSwitchingNetwork={isSwitchingNetwork}
        />
      )}

      {/* Balance Display - New Modular Component */}
      {isConnected && (
        <BalanceDisplay
          walletBalance={walletBalance}
          vaultBalance={vaultBalance}
          chain={activeChain}
          isLoading={isLoading}
        />
      )}

      {/* Token Management - Keep existing tab design but use modular components */}
      {isConnected && (
        <div className="space-y-6">
          <Tabs defaultValue="wallet" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="wallet">Wallet Tokens</TabsTrigger>
              <TabsTrigger value="vault">Vault Tokens</TabsTrigger>
            </TabsList>

            <TabsContent value="wallet" className="space-y-4">
              <TokenList
                tokens={walletTokens}
                type="wallet"
                isLoading={isLoadingWalletTokens}
                onRefresh={refetchWalletTokens}
                onTokenDeposit={onTokenDeposit}
                onTokenWithdraw={onTokenWithdraw}
                onTokenTransfer={onTokenTransfer}
                chain={activeChain}
              />
            </TabsContent>

            <TabsContent value="vault" className="space-y-4">
              <TokenList
                tokens={vaultTokens}
                type="vault"
                isLoading={isLoadingVaultTokens}
                onRefresh={refetchVaultTokens}
                onTokenDeposit={onTokenDeposit}
                onTokenWithdraw={onTokenWithdraw}
                onTokenTransfer={onTokenTransfer}
                chain={activeChain}
              />
            </TabsContent>
          </Tabs>

          {/* Operation Buttons - New Modular Component */}
          <OperationButtons
            onDeposit={onDeposit}
            onWithdraw={onWithdraw}
            onTransfer={onTransfer}
            isLoading={isLoading}
            isSimulating={isSimulating}
            isTransactionConfirmed={isTransactionConfirmed}
            currentFee={currentFee}
            chain={activeChain}
          />
        </div>
      )}
    </div>
  );
}
