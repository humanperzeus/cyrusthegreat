/**
 * useTokenManagement - Handles all token-related operations
 * Extracted from useVault.ts to separate concerns
 */

import { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { getActiveRpcUrl, getActiveContractAddress } from '@/config/web3';
import { createPublicClient, http } from 'viem';
import { debugLog } from '@/lib/utils';

export interface Token {
  address: string;
  symbol: string;
  balance: string;
  decimals: number;
  isNative?: boolean;
}

export interface TokenManagementHook {
  // Wallet tokens
  walletTokens: Token[];
  isLoadingWalletTokens: boolean;
  fetchWalletTokens: () => Promise<void>;
  refetchWalletTokens: () => void;

  // Vault tokens
  vaultTokens: Token[];
  isLoadingVaultTokens: boolean;
  fetchVaultTokensSigned: () => Promise<void>;
  refetchVaultTokens: () => void;

  // Token operations
  clearTokens: () => void;
  addToken: (token: Token) => void;
  removeToken: (token: Token) => void;
}

export const useTokenManagement = (activeChain: 'ETH' | 'BSC' | 'BASE' = 'ETH'): TokenManagementHook => {
  const { address, isConnected } = useAccount();

  // Wallet tokens state
  const [walletTokens, setWalletTokens] = useState<Token[]>([]);
  const [isLoadingWalletTokens, setIsLoadingWalletTokens] = useState(false);

  // Vault tokens state
  const [vaultTokens, setVaultTokens] = useState<Token[]>([]);
  const [isLoadingVaultTokens, setIsLoadingVaultTokens] = useState(false);

  // Clear all tokens
  const clearTokens = useCallback(() => {
    debugLog('🧹 Clearing all tokens');
    setWalletTokens([]);
    setVaultTokens([]);
  }, []);

  // Add token to list
  const addToken = useCallback((token: Token, type: 'wallet' | 'vault' = 'wallet') => {
    if (type === 'wallet') {
      setWalletTokens(prev => {
        const exists = prev.find(t => t.address === token.address);
        return exists ? prev : [...prev, token];
      });
    } else {
      setVaultTokens(prev => {
        const exists = prev.find(t => t.address === token.address);
        return exists ? prev : [...prev, token];
      });
    }
  }, []);

  // Remove token from list
  const removeToken = useCallback((token: Token, type: 'wallet' | 'vault' = 'wallet') => {
    if (type === 'wallet') {
      setWalletTokens(prev => prev.filter(t => t.address !== token.address));
    } else {
      setVaultTokens(prev => prev.filter(t => t.address !== token.address));
    }
  }, []);

  // Fetch wallet tokens - modular and chain-aware
  const fetchWalletTokens = useCallback(async () => {
    if (!address || !isConnected) return;

    setIsLoadingWalletTokens(true);
    debugLog(`🔄 Fetching wallet tokens for ${activeChain}`);

    try {
      const alchemyUrl = getActiveRpcUrl();
      const response = await fetch(alchemyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getTokenBalances',
          params: [address, 'erc20']
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result?.tokenBalances) {
          await processAlchemyTokens(data.result.tokenBalances, alchemyUrl);
        }
      }
    } catch (error) {
      debugLog(`❌ Failed to fetch wallet tokens: ${error}`);
      setWalletTokens([]);
    } finally {
      setIsLoadingWalletTokens(false);
    }
  }, [address, isConnected, activeChain]);

  // Process Alchemy token data
  const processAlchemyTokens = useCallback(async (tokenBalances: any[], alchemyUrl: string) => {
    const processedTokens: Token[] = [];

    for (const token of tokenBalances) {
      const { contractAddress, tokenBalance: balance, error } = token;

      if (error || !contractAddress || balance === '0') continue;

      try {
        const balanceDecimal = parseInt(balance, 16);
        const metadataResponse = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getTokenMetadata',
            params: [contractAddress]
          })
        });

        let symbol = 'UNKNOWN';
        let decimals = 18;

        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          if (metadata.result) {
            symbol = metadata.result.symbol || 'UNKNOWN';
            decimals = metadata.result.decimals || 18;
          }
        }

        const humanBalance = balanceDecimal / Math.pow(10, decimals);
        processedTokens.push({
          address: contractAddress,
          symbol,
          balance: humanBalance.toFixed(4).replace(/\.?0+$/, ''),
          decimals
        });
      } catch (error) {
        debugLog(`⚠️ Failed to process token ${contractAddress}: ${error}`);
      }
    }

    setWalletTokens(processedTokens);
  }, []);

  // Fetch vault tokens - using contract call
  const fetchVaultTokensSigned = useCallback(async () => {
    if (!address || !isConnected) return;

    setIsLoadingVaultTokens(true);
    debugLog(`🔄 Fetching vault tokens for ${activeChain}`);

    try {
      const contractAddress = getActiveContractAddress();
      const rpcUrl = getActiveRpcUrl();

      const publicClient = createPublicClient({
        transport: http(rpcUrl),
      });

      const result = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: [{
          name: 'getMyVaultedTokens',
          type: 'function',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ type: 'address[]' }, { type: 'uint256[]' }]
        }],
        functionName: 'getMyVaultedTokens',
        args: [],
        account: address,
      });

      if (result && Array.isArray(result)) {
        const [tokenAddresses, tokenBalances] = result;
        await processVaultTokensFromContract(tokenAddresses, tokenBalances);
      }
    } catch (error) {
      debugLog(`❌ Failed to fetch vault tokens: ${error}`);
      setVaultTokens([]);
    } finally {
      setIsLoadingVaultTokens(false);
    }
  }, [address, isConnected, activeChain]);

  // Process vault tokens from contract
  const processVaultTokensFromContract = useCallback(async (tokenAddresses: any[], tokenBalances: any[]) => {
    const processedTokens: Token[] = [];

    for (let i = 0; i < tokenAddresses.length; i++) {
      const tokenAddr = tokenAddresses[i];
      const tokenBalance = tokenBalances[i];

      if (tokenAddr === '0x0000000000000000000000000000000000000000') continue;

      try {
        const rpcUrl = getActiveRpcUrl();
        const metadataResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getTokenMetadata',
            params: [tokenAddr]
          })
        });

        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          if (metadata.result) {
            const processedToken: Token = {
              address: tokenAddr,
              symbol: metadata.result.symbol || 'UNKNOWN',
              balance: tokenBalance ? formatEther(tokenBalance as bigint) : '0',
              decimals: metadata.result.decimals || 18
            };
            processedTokens.push(processedToken);
          }
        }
      } catch (error) {
        debugLog(`⚠️ Failed to process vault token ${tokenAddr}: ${error}`);
        processedTokens.push({
          address: tokenAddr,
          symbol: 'UNKNOWN',
          balance: tokenBalance ? formatEther(tokenBalance as bigint) : '0',
          decimals: 18
        });
      }
    }

    setVaultTokens(processedTokens);
  }, [activeChain]);

  // Auto-fetch tokens when wallet connects or chain changes
  useEffect(() => {
    if (isConnected && address) {
      fetchWalletTokens();
      fetchVaultTokensSigned();
    } else {
      clearTokens();
    }
  }, [isConnected, address, activeChain]);

  // Clear tokens when chain changes
  useEffect(() => {
    clearTokens();
  }, [activeChain]);

  return {
    // Wallet tokens
    walletTokens,
    isLoadingWalletTokens,
    fetchWalletTokens,
    refetchWalletTokens: fetchWalletTokens,

    // Vault tokens
    vaultTokens,
    isLoadingVaultTokens,
    fetchVaultTokensSigned,
    refetchVaultTokens: fetchVaultTokensSigned,

    // Token operations
    clearTokens,
    addToken,
    removeToken
  };
};
