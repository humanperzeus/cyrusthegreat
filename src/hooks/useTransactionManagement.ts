/**
 * useTransactionManagement - Handles all transaction operations
 * Extracted from useVault.ts to separate concerns
 */

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { getActiveContractAddress, VAULT_ABI, getChainConfig } from '@/config/web3';
import { debugLog, debugWarn, debugError } from '@/lib/utils';
import { OperationSystem } from '@/systems/OperationSystem';

export interface TransactionState {
  isLoading: boolean;
  isSimulating: boolean;
  hasRefreshedAfterConfirmation: boolean;
  lastTransactionHash: string | null;
  error: string | null;
}

export interface TransactionManagementHook {
  // Chain-specific transaction states
  transactionStates: Record<'ETH' | 'BSC' | 'BASE', TransactionState>;

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

  // Transaction state management
  setTransactionState: (chain: 'ETH' | 'BSC' | 'BASE', state: Partial<TransactionState>) => void;
  clearTransactionStates: (chain?: 'ETH' | 'BSC' | 'BASE') => void;

  // Utility functions
  getChainFinalityDelay: (chain: 'ETH' | 'BSC' | 'BASE') => number;
}

export const useTransactionManagement = (
  activeChain: 'ETH' | 'BSC' | 'BASE' = 'ETH',
  onTransactionSuccess?: () => void,
  onTransactionError?: (error: string) => void
): TransactionManagementHook => {
  const { address, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  // Chain-specific transaction states
  const [transactionStates, setTransactionStates] = useState<Record<'ETH' | 'BSC' | 'BASE', TransactionState>>({
    ETH: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null, error: null },
    BSC: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null, error: null },
    BASE: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null, error: null }
  });

  // Contract write functions
  const { writeContract: writeContractAction, data: hash, isPending, error: writeError } = useWriteContract();

  // Transaction receipt watching
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Chain-specific finality delays
  const getChainFinalityDelay = useCallback((chain: 'ETH' | 'BSC' | 'BASE'): number => {
    switch (chain) {
      case 'ETH':
        return 12000; // 12 seconds
      case 'BSC':
        return 8000;  // 8 seconds
      case 'BASE':
        return 2000;  // 2 seconds (fast chain)
      default:
        return 5000;  // 5 seconds default
    }
  }, []);

  // Update transaction state for a specific chain
  const setTransactionState = useCallback((chain: 'ETH' | 'BSC' | 'BASE', state: Partial<TransactionState>) => {
    setTransactionStates(prev => ({
      ...prev,
      [chain]: { ...prev[chain], ...state }
    }));
  }, []);

  // Clear transaction states
  const clearTransactionStates = useCallback((chain?: 'ETH' | 'BSC' | 'BASE') => {
    if (chain) {
      setTransactionStates(prev => ({
        ...prev,
        [chain]: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null, error: null }
      }));
    } else {
      setTransactionStates({
        ETH: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null, error: null },
        BSC: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null, error: null },
        BASE: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null, error: null }
      });
    }
  }, []);

  // Handle transaction confirmation and finality
  useEffect(() => {
    if (isConfirmed && hash) {
      const currentState = transactionStates[activeChain];
      if (!currentState.hasRefreshedAfterConfirmation) {
        debugLog(`✅ Transaction confirmed: ${hash}`);

        setTransactionState(activeChain, {
          hasRefreshedAfterConfirmation: true,
          lastTransactionHash: hash
        });

        // Apply chain-specific finality delay
        const finalityDelay = getChainFinalityDelay(activeChain);

        if (finalityDelay > 0) {
          debugLog(`⏰ Waiting ${finalityDelay}ms for ${activeChain} chain finality...`);
          setTimeout(() => {
            debugLog(`🔄 Refreshing data after ${activeChain} finality delay`);
            onTransactionSuccess?.();
            setTransactionState(activeChain, {
              isLoading: false,
              isSimulating: false
            });
          }, finalityDelay);
        } else {
          onTransactionSuccess?.();
          setTransactionState(activeChain, {
            isLoading: false,
            isSimulating: false
          });
        }
      }
    }
  }, [isConfirmed, hash, activeChain, transactionStates, getChainFinalityDelay, setTransactionState, onTransactionSuccess]);

  // Handle transaction errors
  useEffect(() => {
    if (writeError) {
      debugError(`❌ Transaction error: ${writeError.message}`);
      setTransactionState(activeChain, {
        isLoading: false,
        isSimulating: false,
        error: writeError.message
      });
      onTransactionError?.(writeError.message);
    }
  }, [writeError, activeChain, setTransactionState, onTransactionError]);

  // Handle pending states
  useEffect(() => {
    if (isPending) {
      debugLog('⏳ Transaction pending...');
      setTransactionState(activeChain, { isLoading: true });
    }
  }, [isPending, activeChain, setTransactionState]);

  // Native ETH operations
  const depositETH = useCallback(async (amount: string) => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected');
    }

    setTransactionState(activeChain, { isLoading: true, isSimulating: true });

    try {
      const amountInWei = parseEther(amount);
      const contractAddress = getActiveContractAddress();

      writeContractAction({
        address: contractAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'depositETH',
        value: amountInWei,
      });

      debugLog(`📤 Depositing ${amount} ETH`);
    } catch (error) {
      debugError(`❌ Deposit ETH error: ${error}`);
      setTransactionState(activeChain, {
        isLoading: false,
        isSimulating: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [address, isConnected, activeChain, writeContractAction, setTransactionState]);

  const withdrawETH = useCallback(async (amount: string) => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected');
    }

    setTransactionState(activeChain, { isLoading: true, isSimulating: true });

    try {
      const amountInWei = parseEther(amount);
      const contractAddress = getActiveContractAddress();

      writeContractAction({
        address: contractAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'withdrawETH',
        args: [amountInWei],
        value: parseEther('0'), // Fee is handled internally
      });

      debugLog(`📥 Withdrawing ${amount} ETH`);
    } catch (error) {
      debugError(`❌ Withdraw ETH error: ${error}`);
      setTransactionState(activeChain, {
        isLoading: false,
        isSimulating: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [address, isConnected, activeChain, writeContractAction, setTransactionState]);

  const transferInternalETH = useCallback(async (to: string, amount: string) => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected');
    }

    setTransactionState(activeChain, { isLoading: true, isSimulating: true });

    try {
      const amountInWei = parseEther(amount);
      const contractAddress = getActiveContractAddress();

      writeContractAction({
        address: contractAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'transferInternalETH',
        args: [to as `0x${string}`, amountInWei],
        value: parseEther('0'), // Fee is handled internally
      });

      debugLog(`🔄 Transferring ${amount} ETH to ${to}`);
    } catch (error) {
      debugError(`❌ Transfer ETH error: ${error}`);
      setTransactionState(activeChain, {
        isLoading: false,
        isSimulating: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [address, isConnected, activeChain, writeContractAction, setTransactionState]);

  // Token operations
  const depositToken = useCallback(async (tokenAddress: string, amount: string) => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected');
    }

    setTransactionState(activeChain, { isLoading: true, isSimulating: true });

    try {
      const contractAddress = getActiveContractAddress();

      writeContractAction({
        address: contractAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'depositToken',
        args: [tokenAddress as `0x${string}`, parseEther(amount)],
        value: parseEther('0'), // Fee is handled internally
      });

      debugLog(`📤 Depositing ${amount} tokens: ${tokenAddress}`);
    } catch (error) {
      debugError(`❌ Deposit token error: ${error}`);
      setTransactionState(activeChain, {
        isLoading: false,
        isSimulating: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [address, isConnected, activeChain, writeContractAction, setTransactionState]);

  const withdrawToken = useCallback(async (tokenAddress: string, amount: string) => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected');
    }

    setTransactionState(activeChain, { isLoading: true, isSimulating: true });

    try {
      const contractAddress = getActiveContractAddress();

      writeContractAction({
        address: contractAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'withdrawToken',
        args: [tokenAddress as `0x${string}`, parseEther(amount)],
        value: parseEther('0'), // Fee is handled internally
      });

      debugLog(`📥 Withdrawing ${amount} tokens: ${tokenAddress}`);
    } catch (error) {
      debugError(`❌ Withdraw token error: ${error}`);
      setTransactionState(activeChain, {
        isLoading: false,
        isSimulating: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [address, isConnected, activeChain, writeContractAction, setTransactionState]);

  const transferInternalToken = useCallback(async (tokenAddress: string, to: string, amount: string) => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected');
    }

    setTransactionState(activeChain, { isLoading: true, isSimulating: true });

    try {
      const contractAddress = getActiveContractAddress();

      writeContractAction({
        address: contractAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'transferInternalToken',
        args: [tokenAddress as `0x${string}`, to as `0x${string}`, parseEther(amount)],
        value: parseEther('0'), // Fee is handled internally
      });

      debugLog(`🔄 Transferring ${amount} tokens to ${to}: ${tokenAddress}`);
    } catch (error) {
      debugError(`❌ Transfer token error: ${error}`);
      setTransactionState(activeChain, {
        isLoading: false,
        isSimulating: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [address, isConnected, activeChain, writeContractAction, setTransactionState]);

  // Multi-token operations
  const depositMultipleTokens = useCallback(async (tokens: string[], amounts: string[]) => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected');
    }

    setTransactionState(activeChain, { isLoading: true, isSimulating: true });

    try {
      const contractAddress = getActiveContractAddress();
      const tokenAddresses = tokens.map(t => t as `0x${string}`);
      const tokenAmounts = amounts.map(a => parseEther(a));

      writeContractAction({
        address: contractAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'depositMultipleTokens',
        args: [tokenAddresses, tokenAmounts],
        value: parseEther('0'), // Fee is handled internally
      });

      debugLog(`📤 Multi-depositing ${tokens.length} tokens`);
    } catch (error) {
      debugError(`❌ Multi-deposit error: ${error}`);
      setTransactionState(activeChain, {
        isLoading: false,
        isSimulating: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [address, isConnected, activeChain, writeContractAction, setTransactionState]);

  const withdrawMultipleTokens = useCallback(async (tokens: string[], amounts: string[]) => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected');
    }

    setTransactionState(activeChain, { isLoading: true, isSimulating: true });

    try {
      const contractAddress = getActiveContractAddress();
      const tokenAddresses = tokens.map(t => t as `0x${string}`);
      const tokenAmounts = amounts.map(a => parseEther(a));

      writeContractAction({
        address: contractAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'withdrawMultipleTokens',
        args: [tokenAddresses, tokenAmounts],
        value: parseEther('0'), // Fee is handled internally
      });

      debugLog(`📥 Multi-withdrawing ${tokens.length} tokens`);
    } catch (error) {
      debugError(`❌ Multi-withdraw error: ${error}`);
      setTransactionState(activeChain, {
        isLoading: false,
        isSimulating: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [address, isConnected, activeChain, writeContractAction, setTransactionState]);

  const transferMultipleTokensInternal = useCallback(async (tokens: string[], to: string, amounts: string[]) => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected');
    }

    setTransactionState(activeChain, { isLoading: true, isSimulating: true });

    try {
      const contractAddress = getActiveContractAddress();
      const tokenAddresses = tokens.map(t => t as `0x${string}`);
      const tokenAmounts = amounts.map(a => parseEther(a));

      writeContractAction({
        address: contractAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'transferMultipleTokensInternal',
        args: [tokenAddresses, to as `0x${string}`, tokenAmounts],
        value: parseEther('0'), // Fee is handled internally
      });

      debugLog(`🔄 Multi-transferring ${tokens.length} tokens to ${to}`);
    } catch (error) {
      debugError(`❌ Multi-transfer error: ${error}`);
      setTransactionState(activeChain, {
        isLoading: false,
        isSimulating: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }, [address, isConnected, activeChain, writeContractAction, setTransactionState]);

  return {
    // Chain-specific transaction states
    transactionStates,

    // Transaction operations
    depositETH,
    withdrawETH,
    transferInternalETH,

    depositToken,
    withdrawToken,
    transferInternalToken,

    // Multi-token operations
    depositMultipleTokens,
    withdrawMultipleTokens,
    transferMultipleTokensInternal,

    // Transaction state management
    setTransactionState,
    clearTransactionStates,

    // Utility functions
    getChainFinalityDelay
  };
};
