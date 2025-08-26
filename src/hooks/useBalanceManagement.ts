/**
 * useBalanceManagement - Handles balance-related operations
 * Extracted from useVault.ts to separate concerns
 */

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useBalance, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { getActiveContractAddress, VAULT_ABI } from '@/config/web3';
import { debugLog } from '@/lib/utils';

export interface BalanceManagementHook {
  // Native token balances
  walletBalance: string;
  vaultBalance: string;

  // Loading states
  isLoadingWalletBalance: boolean;
  isLoadingVaultBalance: boolean;

  // Fee information
  currentFee: string;
  isLoadingFee: boolean;

  // Refetch functions
  refetchWalletBalance: () => void;
  refetchVaultBalance: () => void;
  refetchFee: () => void;

  // Balance utilities
  formatBalance: (balance: string, decimals?: number) => string;
  hasSufficientBalance: (required: string, type: 'wallet' | 'vault') => boolean;
}

export const useBalanceManagement = (activeChain: 'ETH' | 'BSC' | 'BASE' = 'ETH'): BalanceManagementHook => {
  const { address, isConnected } = useAccount();

  // Loading states
  const [isLoadingWalletBalance, setIsLoadingWalletBalance] = useState(false);
  const [isLoadingVaultBalance, setIsLoadingVaultBalance] = useState(false);
  const [isLoadingFee, setIsLoadingFee] = useState(false);

  // Format balance with proper decimals
  const formatBalance = useCallback((balance: string, decimals: number = 4): string => {
    if (!balance || balance === '0') return '0.00';

    const numBalance = parseFloat(balance);
    if (numBalance === 0) return '0.00';

    // For very small amounts
    if (numBalance < 0.0001) {
      return numBalance.toFixed(6);
    }

    // For small amounts
    if (numBalance < 1) {
      return numBalance.toFixed(4);
    }

    // For regular amounts
    if (numBalance < 1000) {
      return numBalance.toFixed(2);
    }

    // For large amounts
    return numBalance.toFixed(0);
  }, []);

  // Check if user has sufficient balance
  const hasSufficientBalance = useCallback((required: string, type: 'wallet' | 'vault'): boolean => {
    const requiredAmount = parseFloat(required);
    const balance = type === 'wallet' ? walletBalance : vaultBalance;
    const availableBalance = parseFloat(balance);

    return availableBalance >= requiredAmount;
  }, []);

  // Wallet balance (native token)
  const { data: walletBalanceData, refetch: refetchWalletBalanceData } = useBalance({
    address: address,
    query: {
      enabled: !!address && isConnected,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchInterval: false,
    },
  });

  const walletBalance = walletBalanceData ? formatEther(walletBalanceData.value) : '0.00';

  // Vault balance (user's native tokens in vault)
  const { data: vaultBalanceData, refetch: refetchVaultBalanceData } = useReadContract({
    address: getActiveContractAddress() as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'getBalance',
    args: address ? [address, '0x0000000000000000000000000000000000000000'] : undefined,
    query: {
      enabled: !!address && isConnected,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchInterval: false,
    },
  });

  const vaultBalance = vaultBalanceData ? formatEther(vaultBalanceData as bigint) : '0.00';

  // Current fee
  const { data: feeData, refetch: refetchFeeData } = useReadContract({
    address: getActiveContractAddress() as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'getCurrentFeeInWei',
    query: {
      enabled: !!address && isConnected,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchInterval: false,
    },
  });

  const currentFee = feeData ? formatEther(feeData as bigint) : '0.00';

  // Update loading states
  useEffect(() => {
    setIsLoadingWalletBalance(!walletBalanceData && !!address);
  }, [walletBalanceData, address]);

  useEffect(() => {
    setIsLoadingVaultBalance(!vaultBalanceData && !!address);
  }, [vaultBalanceData, address]);

  useEffect(() => {
    setIsLoadingFee(!feeData && !!address);
  }, [feeData, address]);

  // Wrapped refetch functions with logging
  const refetchWalletBalance = useCallback(() => {
    debugLog('🔄 Refetching wallet balance');
    refetchWalletBalanceData();
  }, [refetchWalletBalanceData]);

  const refetchVaultBalance = useCallback(() => {
    debugLog('🔄 Refetching vault balance');
    refetchVaultBalanceData();
  }, [refetchVaultBalanceData]);

  const refetchFee = useCallback(() => {
    debugLog('🔄 Refetching current fee');
    refetchFeeData();
  }, [refetchFeeData]);

  return {
    // Native token balances
    walletBalance,
    vaultBalance,

    // Loading states
    isLoadingWalletBalance,
    isLoadingVaultBalance,
    isLoadingFee,

    // Fee information
    currentFee,

    // Refetch functions
    refetchWalletBalance,
    refetchVaultBalance,
    refetchFee,

    // Balance utilities
    formatBalance,
    hasSufficientBalance
  };
};
