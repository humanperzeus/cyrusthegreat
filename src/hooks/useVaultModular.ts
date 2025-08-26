/**
 * useVaultModular - Refactored vault hook using the modular system
 * This replaces the massive useVault.ts with a clean, composable approach
 */

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { debugLog, debugWarn } from '@/lib/utils';
import { getCurrentNetwork } from '@/config/web3';
import { useVaultRegistry } from './useVaultRegistry';

export interface VaultHook {
  // Connection state
  address: string | undefined;
  isConnected: boolean;
  chainId: number | undefined;

  // Chain management
  activeChain: 'ETH' | 'BSC' | 'BASE';
  setActiveChain: (chain: 'ETH' | 'BSC' | 'BASE') => void;
  isSwitchingNetwork: boolean;

  // Network info
  currentNetwork: any;

  // Balance information
  walletBalance: string;
  vaultBalance: string;
  currentFee: string;
  isLoadingWalletBalance: boolean;
  isLoadingVaultBalance: boolean;
  isLoadingFee: boolean;

  // Token information
  walletTokens: any[];
  vaultTokens: any[];
  isLoadingWalletTokens: boolean;
  isLoadingVaultTokens: boolean;

  // Transaction state (for active chain)
  isLoading: boolean;
  isSimulating: boolean;
  hasRefreshedAfterConfirmation: boolean;
  lastTransactionHash: string | null;
  transactionError: string | null;

  // Transaction operations
  depositETH: (amount: string) => Promise<void>;
  withdrawETH: (amount: string) => Promise<void>;
  transferInternalETH: (to: string, amount: string) => Promise<void>;

  depositToken: (tokenAddress: string, amount: string) => Promise<void>;
  withdrawToken: (tokenAddress: string, amount: string) => Promise<void>;
  transferInternalToken: (tokenAddress: string, to: string, amount: string) => Promise<void>;

  // Multi-token operations
  depositMultipleTokens: (tokens: string[], amounts: string[]) => Promise<void>;
  withdrawMultipleTokens: (tokens: string[], amounts: string[]) => Promise<void>;
  transferMultipleTokensInternal: (tokens: string[], to: string, amounts: string[]) => Promise<void>;

  // Data refresh functions
  refetchWalletBalance: () => void;
  refetchVaultBalance: () => void;
  refetchFee: () => void;
  refetchWalletTokens: () => void;
  refetchVaultTokens: () => void;
  refreshAll: () => void;

  // Utility functions
  formatBalance: (balance: string, decimals?: number) => string;
  hasSufficientBalance: (required: string, type: 'wallet' | 'vault') => boolean;
  clearTokens: () => void;
}

export const useVaultModular = (initialChain: 'ETH' | 'BSC' | 'BASE' = 'ETH'): VaultHook => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Chain state
  const [activeChain, setActiveChainState] = useState<'ETH' | 'BSC' | 'BASE'>(initialChain);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  // Network configuration
  const currentNetwork = getCurrentNetwork();

  // Use the modular hook registry
  const registry = useVaultRegistry(activeChain);

  // Extract hooks from registry
  const tokenManagement = registry.tokenManagement;
  const balanceManagement = registry.balanceManagement;
  const transactionManagement = registry.transactionManagement;

  // Chain switching logic
  const setActiveChain = useCallback(async (targetChain: 'ETH' | 'BSC' | 'BASE') => {
    if (targetChain === activeChain) return;

    debugLog(`🔄 Switching from ${activeChain} to ${targetChain}`);
    setIsSwitchingNetwork(true);

    try {
      // Clear current data
      registry.clearAll();

      // Update active chain
      setActiveChainState(targetChain);

      // Attempt to switch network if wallet is connected
      if (isConnected) {
        const success = await switchChain({ chainId: getExpectedChainId(targetChain) });
        if (success) {
          debugLog(`✅ Successfully switched to ${targetChain}`);
        } else {
          debugWarn(`⚠️ Failed to switch to ${targetChain} network`);
        }
      }

      // Refresh data for new chain
      setTimeout(() => {
        registry.refreshAll();
        setIsSwitchingNetwork(false);
      }, 1000);

    } catch (error) {
      debugLog(`❌ Error switching to ${targetChain}: ${error}`);
      setIsSwitchingNetwork(false);
    }
  }, [activeChain, isConnected, switchChain, registry]);

  // Get expected chain ID for a target chain
  const getExpectedChainId = useCallback((chain: 'ETH' | 'BSC' | 'BASE'): number => {
    const networkMode = currentNetwork.mode;
    switch (chain) {
      case 'ETH':
        return networkMode === 'mainnet' ? 1 : 11155111;
      case 'BSC':
        return networkMode === 'mainnet' ? 56 : 97;
      case 'BASE':
        return networkMode === 'mainnet' ? 8453 : 84532;
      default:
        return 1;
    }
  }, [currentNetwork.mode]);

  // Transaction operations
  const depositETH = useCallback(async (amount: string) => {
    if (!transactionManagement) throw new Error('Transaction management not available');
    return transactionManagement.depositETH(amount);
  }, [transactionManagement]);

  const withdrawETH = useCallback(async (amount: string) => {
    if (!transactionManagement) throw new Error('Transaction management not available');
    return transactionManagement.withdrawETH(amount);
  }, [transactionManagement]);

  const transferInternalETH = useCallback(async (to: string, amount: string) => {
    if (!transactionManagement) throw new Error('Transaction management not available');
    return transactionManagement.transferInternalETH(to, amount);
  }, [transactionManagement]);

  const depositToken = useCallback(async (tokenAddress: string, amount: string) => {
    if (!transactionManagement) throw new Error('Transaction management not available');
    return transactionManagement.depositToken(tokenAddress, amount);
  }, [transactionManagement]);

  const withdrawToken = useCallback(async (tokenAddress: string, amount: string) => {
    if (!transactionManagement) throw new Error('Transaction management not available');
    return transactionManagement.withdrawToken(tokenAddress, amount);
  }, [transactionManagement]);

  const transferInternalToken = useCallback(async (tokenAddress: string, to: string, amount: string) => {
    if (!transactionManagement) throw new Error('Transaction management not available');
    return transactionManagement.transferInternalToken(tokenAddress, to, amount);
  }, [transactionManagement]);

  const depositMultipleTokens = useCallback(async (tokens: string[], amounts: string[]) => {
    if (!transactionManagement) throw new Error('Transaction management not available');
    return transactionManagement.depositMultipleTokens(tokens, amounts);
  }, [transactionManagement]);

  const withdrawMultipleTokens = useCallback(async (tokens: string[], amounts: string[]) => {
    if (!transactionManagement) throw new Error('Transaction management not available');
    return transactionManagement.withdrawMultipleTokens(tokens, amounts);
  }, [transactionManagement]);

  const transferMultipleTokensInternal = useCallback(async (tokens: string[], to: string, amounts: string[]) => {
    if (!transactionManagement) throw new Error('Transaction management not available');
    return transactionManagement.transferMultipleTokensInternal(tokens, to, amounts);
  }, [transactionManagement]);

  // Extract transaction state for active chain
  const currentTransactionState = transactionManagement?.transactionStates[activeChain] || {
    isLoading: false,
    isSimulating: false,
    hasRefreshedAfterConfirmation: false,
    lastTransactionHash: null,
    error: null
  };

  return {
    // Connection state
    address,
    isConnected,
    chainId,

    // Chain management
    activeChain,
    setActiveChain,
    isSwitchingNetwork,

    // Network info
    currentNetwork,

    // Balance information
    walletBalance: balanceManagement?.walletBalance || '0.00',
    vaultBalance: balanceManagement?.vaultBalance || '0.00',
    currentFee: balanceManagement?.currentFee || '0.00',
    isLoadingWalletBalance: balanceManagement?.isLoadingWalletBalance || false,
    isLoadingVaultBalance: balanceManagement?.isLoadingVaultBalance || false,
    isLoadingFee: balanceManagement?.isLoadingFee || false,

    // Token information
    walletTokens: tokenManagement?.walletTokens || [],
    vaultTokens: tokenManagement?.vaultTokens || [],
    isLoadingWalletTokens: tokenManagement?.isLoadingWalletTokens || false,
    isLoadingVaultTokens: tokenManagement?.isLoadingVaultTokens || false,

    // Transaction state
    isLoading: currentTransactionState.isLoading,
    isSimulating: currentTransactionState.isSimulating,
    hasRefreshedAfterConfirmation: currentTransactionState.hasRefreshedAfterConfirmation,
    lastTransactionHash: currentTransactionState.lastTransactionHash,
    transactionError: currentTransactionState.error,

    // Transaction operations
    depositETH,
    withdrawETH,
    transferInternalETH,
    depositToken,
    withdrawToken,
    transferInternalToken,
    depositMultipleTokens,
    withdrawMultipleTokens,
    transferMultipleTokensInternal,

    // Data refresh functions
    refetchWalletBalance: balanceManagement?.refetchWalletBalance || (() => {}),
    refetchVaultBalance: balanceManagement?.refetchVaultBalance || (() => {}),
    refetchFee: balanceManagement?.refetchFee || (() => {}),
    refetchWalletTokens: tokenManagement?.refetchWalletTokens || (() => {}),
    refetchVaultTokens: tokenManagement?.refetchVaultTokens || (() => {}),
    refreshAll: registry.refreshAll,

    // Utility functions
    formatBalance: balanceManagement?.formatBalance || ((balance: string) => balance),
    hasSufficientBalance: balanceManagement?.hasSufficientBalance || (() => false),
    clearTokens: tokenManagement?.clearTokens || (() => {})
  };
};
