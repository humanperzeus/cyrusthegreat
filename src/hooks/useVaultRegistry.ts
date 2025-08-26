/**
 * useVaultRegistry - Hook registry system for flexible vault composition
 * This allows you to pick and choose which hooks to use based on your needs
 */

import { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { debugLog } from '@/lib/utils';

// Import all the modular hooks
import { useTokenManagement, TokenManagementHook } from './useTokenManagement';
import { useBalanceManagement, BalanceManagementHook } from './useBalanceManagement';
import { useTransactionManagement, TransactionManagementHook } from './useTransactionManagement';

export interface VaultRegistry {
  // Registered hooks
  tokenManagement?: TokenManagementHook;
  balanceManagement?: BalanceManagementHook;
  transactionManagement?: TransactionManagementHook;

  // Registry management
  registerHook: (name: string, hook: any) => void;
  unregisterHook: (name: string) => void;
  getHook: (name: string) => any;
  hasHook: (name: string) => boolean;

  // Utility functions
  refreshAll: () => void;
  clearAll: () => void;
}

export const useVaultRegistry = (activeChain: 'ETH' | 'BSC' | 'BASE' = 'ETH'): VaultRegistry => {
  const { address, isConnected } = useAccount();
  const [hooks, setHooks] = useState<Record<string, any>>({});

  // Initialize token management hook
  const tokenManagement = useTokenManagement(activeChain);

  // Initialize balance management hook
  const balanceManagement = useBalanceManagement(activeChain);

  // Initialize transaction management hook with callbacks
  const transactionManagement = useTransactionManagement(
    activeChain,
    () => {
      // On transaction success, refresh balances and tokens
      debugLog('🔄 Transaction success - refreshing data');
      balanceManagement.refetchWalletBalance();
      balanceManagement.refetchVaultBalance();
      balanceManagement.refetchFee();
      tokenManagement.refetchWalletTokens();
      tokenManagement.refetchVaultTokens();
    },
    (error) => {
      debugLog(`❌ Transaction error: ${error}`);
    }
  );

  // Register hooks
  useEffect(() => {
    setHooks({
      tokenManagement,
      balanceManagement,
      transactionManagement
    });
  }, [tokenManagement, balanceManagement, transactionManagement]);

  // Hook registry management
  const registerHook = useCallback((name: string, hook: any) => {
    setHooks(prev => ({ ...prev, [name]: hook }));
    debugLog(`📝 Registered hook: ${name}`);
  }, []);

  const unregisterHook = useCallback((name: string) => {
    setHooks(prev => {
      const newHooks = { ...prev };
      delete newHooks[name];
      return newHooks;
    });
    debugLog(`🗑️ Unregistered hook: ${name}`);
  }, []);

  const getHook = useCallback((name: string) => {
    return hooks[name];
  }, [hooks]);

  const hasHook = useCallback((name: string) => {
    return name in hooks;
  }, [hooks]);

  // Refresh all data across all hooks
  const refreshAll = useCallback(() => {
    debugLog('🔄 Refreshing all vault data');

    if (balanceManagement) {
      balanceManagement.refetchWalletBalance();
      balanceManagement.refetchVaultBalance();
      balanceManagement.refetchFee();
    }

    if (tokenManagement) {
      tokenManagement.refetchWalletTokens();
      tokenManagement.refetchVaultTokens();
    }
  }, [balanceManagement, tokenManagement]);

  // Clear all data across all hooks
  const clearAll = useCallback(() => {
    debugLog('🧹 Clearing all vault data');

    if (tokenManagement) {
      tokenManagement.clearTokens();
    }

    if (transactionManagement) {
      transactionManagement.clearTransactionStates();
    }
  }, [tokenManagement, transactionManagement]);

  // Clear data when chain changes
  useEffect(() => {
    clearAll();
  }, [activeChain, clearAll]);

  // Auto-refresh when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      refreshAll();
    } else {
      clearAll();
    }
  }, [isConnected, address, refreshAll, clearAll]);

  return {
    // Registered hooks
    tokenManagement,
    balanceManagement,
    transactionManagement,

    // Registry management
    registerHook,
    unregisterHook,
    getHook,
    hasHook,

    // Utility functions
    refreshAll,
    clearAll
  };
};
