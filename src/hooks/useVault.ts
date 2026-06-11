import React, { useState, useCallback, useEffect } from 'react';
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { readContract, waitForTransactionReceipt, writeContract } from '@wagmi/core';
import { sepolia, mainnet, bsc, bscTestnet, base, baseSepolia, arbitrum, arbitrumSepolia, hyperEvm, hyperliquidEvmTestnet } from 'wagmi/chains';
import { formatEther, parseEther, parseUnits, formatUnits } from 'viem';
import { getContract } from 'viem';
import { WEB3_CONFIG, VAULT_ABI, getContractAddress, getCurrentNetwork, getRpcUrl, getChainConfig, getBestRpcUrl, getChainNetworkInfo } from '@/config/web3';
import { config } from '@/lib/wagmi';
import { useToast } from '@/hooks/use-toast';
import { decodeFunctionResult, encodeFunctionData } from 'viem';
import { createPublicClient, http } from 'viem';
import { debugLog, debugWarn, debugError, weiToEtherFullPrecision, fetchTokenDecimals, fetchTokenSymbol, formatTokenBalance, bigIntToFullPrecisionString, convertToWei } from '@/lib/utils';

// Add window.ethereum type
declare global {
  interface Window {
    ethereum?: any;
  }
}

export const useVault = (activeChain: 'ETH' | 'BSC' | 'BASE' | 'ARB' | 'HYPER' = 'ETH') => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { toast } = useToast();
  const { switchChain } = useSwitchChain();

  // 2026-06-10: HIDDEN, not removed. Every successful tx in the
  // happy-path lifecycle previously fired a corner toast ("Deposit
  // Confirmed", "Multi-token withdrawal confirmed", etc.). With the
  // App-level ProgressFlow now showing the same "Confirm on-chain" ✓
  // for every flow, those corner toasts were strict duplicates — the
  // user pointed this out, so we gate them all behind one flag.
  // Flip to true to bring them back (e.g. if the ProgressFlow ever
  // gets disabled / hidden). Error toasts and pre-flight blockers are
  // kept on regardless — they're not duplicates of anything in the
  // popup. This is the same pattern as SHOW_CONFIRMATION_TOAST further
  // down (the generic "Transaction Confirmed!" toast); kept as a
  // separate flag so the two layers can be toggled independently.
  const SHOW_LIFECYCLE_CONFIRMATION_TOASTS = false;

  // Get current network configuration
  const currentNetwork = getCurrentNetwork();

  // State for network switching
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  
  // Chain switching state
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);

  // Clear vault tokens when switching chains to prevent stale data
  const clearVaultTokens = useCallback(() => {
    debugLog('🧹 Clearing vault tokens due to chain switch');
    setVaultTokens([]);
  }, []);

  // Clear vault tokens and transaction states whenever activeChain changes
  useEffect(() => {
    debugLog(`🔄 Active chain changed to: ${activeChain}`);
    
    // Force clear vault tokens immediately
    setVaultTokens([]);
    debugLog(`🧹 Vault tokens cleared for chain switch to ${activeChain}`);
    
    // CRITICAL FIX: Clear transaction states to prevent stuck modals
    // Note: This is now handled by chain-specific state management below
    debugLog(`🧹 Transaction states will be cleared for chain switch to ${activeChain}`);
  }, [activeChain]);

  // Additional safety: clear vault tokens when chainId changes
  useEffect(() => {
    if (chainId && activeChain) {
      const expectedChainId = activeChain === 'ETH'
        ? (currentNetwork.mode === 'mainnet' ? 1 : 11155111)
        : activeChain === 'BSC'
        ? (currentNetwork.mode === 'mainnet' ? 56 : 97)
        : activeChain === 'BASE'
        ? (currentNetwork.mode === 'mainnet' ? 8453 : 84532)
        : activeChain === 'ARB'
        ? (currentNetwork.mode === 'mainnet' ? 42161 : 421614)
        : (currentNetwork.mode === 'mainnet' ? 999 : 998);  // HYPER
      
      if (chainId !== expectedChainId) {
        debugLog(`🔄 Chain ID changed from ${expectedChainId} to ${chainId}, clearing vault tokens`);
        setVaultTokens([]);
      }
    }
  }, [chainId, activeChain, currentNetwork.mode]);
  
  // Debounced vault token fetch to prevent race conditions
  const [vaultTokenFetchTimeout, setVaultTokenFetchTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (vaultTokenFetchTimeout) {
        clearTimeout(vaultTokenFetchTimeout);
      }
    };
  }, [vaultTokenFetchTimeout]);
  
  const debouncedFetchVaultTokens = useCallback(() => {
    // Clear any existing timeout
    if (vaultTokenFetchTimeout) {
      clearTimeout(vaultTokenFetchTimeout);
    }
    
    // Capture current chain to prevent race conditions
    const currentChain = activeChain;
    
    // Set new timeout for 500ms delay
    const timeout = setTimeout(() => {
      debugLog(`⏰ Debounced vault token fetch triggered for ${currentChain}`);
      
      // Only fetch if we're still on the same chain
      if (activeChain === currentChain) {
        fetchVaultTokensSigned();
      } else {
        debugLog(`⚠️ Chain changed during debounce from ${currentChain} to ${activeChain}, aborting fetch`);
      }
    }, 500);
    
    setVaultTokenFetchTimeout(timeout);
  }, [vaultTokenFetchTimeout, activeChain]);

  // Get contract address based on active chain
  const getActiveContractAddress = () => {
    return getContractAddress(activeChain);
  };
  
  // Get RPC URL based on active chain
  const getActiveRpcUrl = () => {
    return getBestRpcUrl(activeChain);
  };
  
  // Get current chain configuration
  const getCurrentChainConfig = () => {
    return getChainConfig(activeChain);
  };
  
  // Function to get the target chain based on active chain and network mode
  const getTargetChain = () => {
    if (activeChain === 'ETH') {
      if (currentNetwork.mode === 'mainnet') {
        return mainnet; // Ethereum mainnet
      } else {
        return sepolia; // Ethereum testnet (Sepolia)
      }
    } else if (activeChain === 'BSC') {
      if (currentNetwork.mode === 'mainnet') {
        return bsc; // BSC mainnet
      } else {
        return bscTestnet; // BSC testnet
      }
    } else if (activeChain === 'BASE') {
      if (currentNetwork.mode === 'mainnet') {
        return base; // Base mainnet
      } else {
        return baseSepolia; // Base testnet (Base Sepolia)
      }
    } else if (activeChain === 'ARB') {
      if (currentNetwork.mode === 'mainnet') {
        return arbitrum; // Arbitrum One mainnet
      } else {
        return arbitrumSepolia; // Arbitrum Sepolia testnet
      }
    } else if (activeChain === 'HYPER') {
      if (currentNetwork.mode === 'mainnet') {
        return hyperEvm; // HyperEVM mainnet
      } else {
        return hyperliquidEvmTestnet; // HyperEVM testnet
      }
    }

    // Fallback to ETH if activeChain is not recognized — should be unreachable
    // now that all 5 chains are handled above; kept as defensive catch-all.
    debugWarn(`⚠️ Unknown activeChain: ${activeChain}, falling back to ETH`);
    return currentNetwork.mode === 'mainnet' ? mainnet : sepolia;
  };
  
  // Function to automatically switch to the correct network
  const autoSwitchNetwork = useCallback(async () => {
    if (!isConnected || !address) return;
    
    try {
      debugLog('🔄 Auto-switching network...');
      setIsSwitchingChain(true);
      
      // Clear any existing vault tokens before switching
      clearVaultTokens();
      
      const targetChain = getTargetChain();
      debugLog(`🎯 Target chain: ${targetChain.name} (ID: ${targetChain.id})`);
      
      debugLog('🔍 Network switch details:', {
        currentChainId: chainId,
        targetChainId: targetChain.id,
        targetChainName: targetChain.name,
        currentNetworkMode: currentNetwork.mode
      });
      
      // Check if we're already on the correct network
      if (chainId === targetChain.id) {
        debugLog(`✅ Already on correct network: ${targetChain.name} (${targetChain.id})`);
        return;
      }
      
      debugLog(`🔄 Switching from chain ${chainId} to ${targetChain.name} (${targetChain.id})`);
      
      try {
        setIsSwitchingNetwork(true);
        
        // Skip Wagmi and go directly to MetaMask
        if (window.ethereum) {
          try {
            debugLog('🔄 Direct MetaMask network switch...');
            
            // First try to switch directly
            try {
              await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${targetChain.id.toString(16)}` }],
              });
              debugLog('✅ Direct MetaMask switch successful');
            } catch (switchError: any) {
              debugLog('⚠️ Direct switch failed, error code:', switchError.code);
              
              // If network doesn't exist (error code 4902), add it first
              if (switchError.code === 4902) {
                debugLog('🔄 Network not found, adding to MetaMask...');
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: `0x${targetChain.id.toString(16)}`,
                    chainName: targetChain.name,
                    nativeCurrency: {
                      name: targetChain.nativeCurrency.name,
                      symbol: targetChain.nativeCurrency.symbol,
                      decimals: targetChain.nativeCurrency.decimals,
                    },
                    rpcUrls: [targetChain.rpcUrls.default.http[0]],
                    blockExplorerUrls: [targetChain.blockExplorers?.default?.url],
                  }],
                });
                debugLog('✅ Network added to MetaMask');
              } else {
                throw switchError;
              }
            }
            
          } catch (metamaskError) {
            debugError('❌ MetaMask network switch failed:', metamaskError);
            throw metamaskError;
          }
        } else {
          throw new Error('MetaMask not available');
        }
        
        toast({
          title: "Network Switched",
          description: `Successfully switched to ${targetChain.name}`,
          variant: "default",
        });
        
        debugLog(`✅ Successfully switched to ${targetChain.name}`);
        
        // Wait a moment for the switch to complete, then check if it worked
        setTimeout(() => {
          debugLog('🔍 Checking if network switch actually worked...');
          debugLog('Current chainId:', chainId);
          debugLog('Target chainId:', targetChain.id);
          
          if (chainId !== targetChain.id) {
            debugWarn('⚠️ Network switch may not have worked - chainId still shows:', chainId);
            toast({
              title: "Network Switch Warning",
              description: "Network may not have switched. Please check MetaMask manually.",
              variant: "destructive",
            });
          }
        }, 3000);
        
      } catch (error) {
        debugError('❌ Failed to switch network:', error);
        
        toast({
          title: "Network Switch Failed",
          description: error instanceof Error ? error.message : "Failed to switch network. Please switch manually in MetaMask.",
          variant: "destructive",
        });
      } finally {
        setIsSwitchingNetwork(false);
        setIsSwitchingChain(false);
      }
    } catch (error) {
      debugError('❌ Error switching network:', error);
      toast({
        title: "Network Switch Failed",
        description: "Failed to switch network. Please try again.",
        variant: "destructive",
      });
      setIsSwitchingNetwork(false);
      setIsSwitchingChain(false);
    }
  }, [isConnected, address, chainId, currentNetwork.mode]);
  
  // Track if we've already shown the network notification on initial load
  const [hasShownInitialNetworkCheck, setHasShownInitialNetworkCheck] = useState(false);

  // Auto-switch network when component mounts or network mode changes
  React.useEffect(() => {
          // Check network only when wallet connects (not on every chainId change)
      if (isConnected && !isSwitchingNetwork && !hasShownInitialNetworkCheck) {
        debugLog('🚀 Wallet connected, checking network...');
        debugLog('Current chainId:', chainId);
        debugLog('Target chainId:', getTargetChain().id);
        debugLog('Network mode:', currentNetwork.mode);
      
      // Mark that we've done the initial check
      setHasShownInitialNetworkCheck(true);
      
      // Only show notification if not on correct network, but don't force switch
      if (chainId !== getTargetChain().id) {
        if (process.env.NODE_ENV === 'development') {
          debugLog('🔄 Chain mismatch detected, showing notification...');
        }
        
        // Show friendly notification instead of forcing switch
        toast({
          title: "Network Info",
          description: `App optimized for ${getTargetChain().name}. You can switch manually if needed.`,
          variant: "default",
        });
      } else {
        if (process.env.NODE_ENV === 'development') {
          debugLog('✅ Already on correct network');
        }
      }
    }
  }, [isConnected, hasShownInitialNetworkCheck]); // Only depend on isConnected and our flag
  
  // Debug logging for network switching
  React.useEffect(() => {
    debugLog('🌐 Network Configuration Debug:', {
      networkMode: currentNetwork.mode,
      isMainnet: currentNetwork.isMainnet,
      isTestnet: currentNetwork.isTestnet,
      targetChainId: getTargetChain().id,
      currentChainId: chainId,
      isConnected,
      isSwitchingNetwork
    });
    
    // Add manual test function to window for debugging
    (window as any).testNetworkSwitch = () => {
      debugLog('🧪 Manual network switch test triggered');
      debugLog('Current state:', {
        isConnected,
        isSwitchingNetwork,
        currentNetwork: currentNetwork.mode,
        chainId,
        targetChain: getTargetChain()
      });
      autoSwitchNetwork();
    };
    
    (window as any).getNetworkInfo = () => {
      return {
        networkMode: currentNetwork.mode,
        isMainnet: currentNetwork.isMainnet,
        isTestnet: currentNetwork.isTestnet,
        targetChain: getTargetChain(),
        currentChainId: chainId,
        isConnected,
        isSwitchingNetwork
      };
    };
    
    // Test if switchChain function exists and works
    (window as any).testSwitchChain = async () => {
      debugLog('🧪 Testing switchChain function...');
      debugLog('switchChain function:', switchChain);
      debugLog('isConnected:', isConnected);
      debugLog('chainId:', chainId);
      
      if (!switchChain) {
        debugError('❌ switchChain function is not available');
        return;
      }
      
      try {
        // Try to switch to Sepolia (testnet) as a test
        debugLog('🔄 Testing switch to Sepolia...');
        const result = await switchChain({ chainId: 11155111 }); // Sepolia
        debugLog('✅ Test switch result:', result);
      } catch (error) {
        debugError('❌ Test switch failed:', error);
      }
    };
    
    // Force refresh function to test network switching
    (window as any).forceNetworkSwitch = async () => {
      debugLog('🧪 Force network switch test...');
      debugLog('Current state before switch:', {
        isConnected,
        isSwitchingNetwork,
        currentNetwork: currentNetwork.mode,
        chainId,
        targetChain: getTargetChain()
      });
      
      // Force the network switch
      await autoSwitchNetwork();
      
      // Wait and check result
      setTimeout(() => {
        debugLog('Current state after switch:', {
          isConnected,
          isSwitchingNetwork,
          currentNetwork: currentNetwork.mode,
          chainId,
          targetChain: getTargetChain()
        });
      }, 2000);
    };
    
    // Debug contract and RPC configuration
    (window as any).debugConfig = () => {
      debugLog('🔧 Full Configuration Debug:', {
        // Environment variables
        VITE_NETWORK_MODE: import.meta.env.VITE_NETWORK_MODE,
        VITE_CTGVAULT_ETH_MAINNET_CONTRACT: import.meta.env.VITE_CTGVAULT_ETH_MAINNET_CONTRACT,
        VITE_CTGVAULT_ETH_TESTNET_CONTRACT: import.meta.env.VITE_CTGVAULT_ETH_TESTNET_CONTRACT,
        VITE_ALCHEMY_ETH_MAINNET_RPC_URL: import.meta.env.VITE_ALCHEMY_ETH_MAINNET_RPC_URL,
        VITE_ALCHEMY_ETH_TESTNET_RPC_URL: import.meta.env.VITE_ALCHEMY_ETH_TESTNET_RPC_URL,
        
        // Computed values
        computedContractAddress: getActiveContractAddress(),
        
        // Current network state
        currentNetworkMode: currentNetwork.mode,
        targetChain: getTargetChain(),
        actualChainId: chainId
      });
    };
  }, [currentNetwork.mode, chainId, isConnected, isSwitchingNetwork]);
  
  // Get wallet ETH balance with smart refetch (no constant polling)
  const { data: walletBalance, refetch: refetchWalletBalance } = useBalance({
    address: address,
    query: {
      enabled: !!address,
      // Only refetch when user returns to tab (no constant polling)
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      // NO constant background polling!
      refetchInterval: false,
    },
  });

  // Get vault ETH balance using the correct function name from the real ABI
  const { data: vaultBalanceData, refetch: refetchVaultBalance, error: vaultBalanceError, isError: isVaultBalanceError } = useReadContract({
    address: getActiveContractAddress() as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'getBalance', // Changed from 'getETHBalance' to 'getBalance'
    args: address ? [address, '0x0000000000000000000000000000000000000000'] : undefined, // ETH is represented as address(0)
    query: {
      enabled: !!address,
      // Only refetch when user returns to tab (no constant polling)
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      // NO constant background polling!
      refetchInterval: false,
    },
  });

  // Debug logging for vault balance errors
  React.useEffect(() => {
    if (isVaultBalanceError && vaultBalanceError) {
      debugError('❌ Vault Balance Contract Call Error:', {
        error: vaultBalanceError,
        contractAddress: getActiveContractAddress(),
        functionName: 'getBalance',
        args: address ? [address, '0x0000000000000000000000000000000000000000'] : undefined,
        address,
        activeChain
      });
    }
  }, [isVaultBalanceError, vaultBalanceError, address, activeChain]);

  // Debug logging for vault balance fetching
  React.useEffect(() => {
    debugLog('🔍 Vault Balance Fetching Debug:', {
      address,
      contractAddress: getActiveContractAddress(),
    args: address ? [address, '0x0000000000000000000000000000000000000000'] : undefined,
      vaultBalanceData,
      vaultBalanceDataType: typeof vaultBalanceData,
      vaultBalanceDataValue: vaultBalanceData?.toString(),
      isEnabled: !!address
  });
  }, [address, vaultBalanceData]);

  // Get current fee from contract
  const { data: currentFee, refetch: refetchFee } = useReadContract({
    address: getActiveContractAddress() as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'getCurrentFeeInWei',
    query: {
      enabled: !!address,
      // Only refetch when user returns to tab (no constant polling)
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      // NO constant background polling!
      refetchInterval: false,
    },
  });

  // CRITICAL FIX: Add missing getCurrentFee function
  const getCurrentFee = useCallback(async (): Promise<bigint | null> => {
    try {
      debugLog('💰 Getting current fee from contract...');
      
      // Use the existing currentFee data if available
      if (currentFee) {
        debugLog(`✅ Using cached fee: ${currentFee.toString()} wei`);
        return currentFee as bigint;
      }
      
      // If no cached fee, fetch it manually
      debugLog('🔄 No cached fee, fetching manually...');
      const result = await readContract(config, {
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'getCurrentFeeInWei',
        account: address!
      });
      
      debugLog(`✅ Fresh fee fetched: ${result.toString()} wei`);
      return result as bigint;
      
    } catch (error) {
      debugError('❌ Failed to get current fee:', error);
      return null;
    }
  }, [currentFee, address, activeChain]);

  // CRITICAL FIX: Add missing setCurrentFee function
  const setCurrentFee = useCallback((fee: bigint) => {
    debugLog(`💰 Setting current fee: ${fee.toString()} wei`);
    // Note: This is a no-op since we don't have a state setter for currentFee
    // The currentFee is managed by the useReadContract hook
  }, []);

  // Get vault tokens for the connected user - using signed call since it's private
  const { data: vaultTokensData, refetch: refetchVaultTokens } = useReadContract({
    address: getActiveContractAddress() as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'getMyVaultedTokens',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchInterval: false,
    },
  });

  // Get the public client and wallet client at the top level
  const publicClient = usePublicClient();
  const walletClient = useWalletClient();

  // Process vault tokens from signed call result
  const processVaultTokensFromSignedCall = async (tokenAddresses: any[], tokenBalances: any[]) => {
    debugLog('🔄 Starting vault token processing from signed call...');
    const processedTokens = [];
    
    for (let i = 0; i < tokenAddresses.length; i++) {
      const tokenAddr = tokenAddresses[i];
      const tokenBalance = tokenBalances[i];
      
      // Skip native token (address 0) - it's already displayed in top balance
      if (tokenAddr === '0x0000000000000000000000000000000000000000') {
        const chainConfig = getCurrentChainConfig();
        debugLog(`⏭️ Skipping native ${chainConfig.nativeCurrency.symbol} (address 0) - already displayed in top balance`);
        continue;
      }
      
      try {
        // Use the same chain-aware RPC URL that works for wallet tokens
        const rpcUrl = getActiveRpcUrl();

        
        // CRITICAL FIX: Use our fetchTokenDecimals function instead of Alchemy metadata
        // This ensures we get the correct decimals directly from the token contract
        debugLog(`🚀 About to fetch token info for ${tokenAddr}...`);
        
        // Check if publicClient is available
        if (!publicClient) {
          debugError(`❌ No publicClient available for ${tokenAddr}`);
          throw new Error('No publicClient available');
        }
        
        debugLog(`🔧 Using publicClient for ${tokenAddr}:`, publicClient);
        
        const tokenDecimals = await fetchTokenDecimals(tokenAddr, publicClient);
        debugLog(`✅ Fetched decimals: ${tokenDecimals}`);
        
        const tokenSymbol = await fetchTokenSymbol(tokenAddr, publicClient);
        debugLog(`✅ Fetched symbol: ${tokenSymbol}`);
        
              // CRITICAL FIX: Store raw balance to preserve full precision
      // Only format for display when needed, not during storage
      let humanBalance: string;
      if (tokenBalance) {
        // DEBUG: Log the exact type and value to identify precision loss
        debugLog(`🔍 Token balance processing for ${tokenSymbol}:`, {
          tokenBalanceType: typeof tokenBalance,
          tokenBalanceValue: tokenBalance.toString(),
          tokenBalanceLength: tokenBalance.toString().length,
          isBigInt: tokenBalance instanceof BigInt,
          hasScientificNotation: tokenBalance.toString().includes('e+') || tokenBalance.toString().includes('E+')
        });
        
        // CRITICAL FIX: Use the robust BigInt to string conversion function
        // This prevents scientific notation and preserves full precision
        humanBalance = bigIntToFullPrecisionString(tokenBalance);
        
        // CRITICAL: Verify we're not losing precision
        if (humanBalance.includes('e+') || humanBalance.includes('E+')) {
          debugError(`🚨 PRECISION LOSS DETECTED for ${tokenSymbol}! Balance converted to scientific notation:`, humanBalance);
        } else {
          debugLog(`✅ Full precision preserved for ${tokenSymbol}:`, humanBalance);
        }
      } else {
        humanBalance = '0';
      }
        
        const processedToken = {
          address: tokenAddr,
          symbol: tokenSymbol,
          balance: humanBalance,
          decimals: tokenDecimals
        };
        
        processedTokens.push(processedToken);
        debugLog(`✅ Token processed with ${tokenDecimals} decimals:`, processedToken);
    } catch (error) {
        debugError(`❌ Error processing token ${tokenAddr}:`, error);
        // Error fallback
        const errorToken = {
          address: tokenAddr,
          symbol: 'UNKNOWN',
          balance: tokenBalance ? formatEther(tokenBalance as bigint) : '0',
          decimals: 18
        };
        processedTokens.push(errorToken);
      }
    }
    
    debugLog(`✅ Final processed vault tokens:`, processedTokens);
    setVaultTokens(processedTokens);
  };

  // NEW: Signed call for vault tokens since getMyVaultedTokens is private
  const fetchVaultTokensSigned = async () => {
    if (!address || !isConnected) return;
    
    // CRITICAL FIX: Set loading state to show refresh animation
    setIsLoadingVaultTokens(true);
    
    // Capture current chain to prevent race conditions
    const currentChain = activeChain;
    // CRITICAL FIX: Use the new function to get correct chain ID for the active chain
    const currentChainInfo = getChainNetworkInfo(currentChain);
    
    try {
      debugLog(`🔐 Fetching vault tokens for chain: ${currentChain} (ID: ${currentChainInfo.chainId})`);
      
      if (!publicClient || !walletClient) {
        debugError('❌ Public client or wallet client not available');
        return;
      }
      
      // Validate we're still on the same chain
      if (activeChain !== currentChain) {
        debugLog(`⚠️ Chain changed during fetch from ${currentChain} to ${activeChain}, aborting`);
        return;
      }
      
      // CRITICAL FIX: Get the correct contract address for the current chain
      const contractAddress = getActiveContractAddress();
      debugLog(`🏗️ Using contract address for ${currentChain}: ${contractAddress}`);
      
      // CRITICAL FIX: Use expected chain ID from network config instead of potentially stale hook chainId
      const expectedChainId = currentChainInfo.chainId; // Use the new function for consistency
      
      debugLog(`✅ Expected chain ID for ${currentChain} ${currentNetwork.mode}: ${expectedChainId}`);
      debugLog(`🔍 Current hook chainId: ${chainId} (may be stale during chain switch)`);
      
      // Don't abort on chain ID mismatch - the hook chainId might be stale during switching
      // Instead, proceed with the fetch using the correct contract address
      
      // Safety check: Ensure we're using the correct RPC URL for the active chain
      const rpcUrl = getActiveRpcUrl();
      
      
      // Debug: Check if publicClient is configured for the correct chain
      debugLog(`🔍 Public client chain ID: ${publicClient.chain?.id || 'unknown'}`);
      debugLog(`🔍 Expected chain ID: ${expectedChainId}`);
      
      // CRITICAL FIX: Always use chain-aware public client instead of potentially stale publicClient
      const chainAwareClient = createChainAwarePublicClient();
      debugLog(`🔧 Using chain-aware client for ${currentChain} with chain ID: ${chainAwareClient.chain.id}`);
      
      // Make a direct call to the private function using chain-aware client
      const result = await chainAwareClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'getMyVaultedTokens',
        args: [],
        account: address,
      });
      
      // Double-check chain hasn't changed after the call
      if (activeChain !== currentChain) {
        debugLog(`⚠️ Chain changed after contract call from ${currentChain} to ${activeChain}, discarding results`);
        return;
      }
      
      debugLog(`✅ Vault tokens fetched for ${currentChain}:`, result);
      
      // Process the result directly
      if (result && Array.isArray(result)) {
        // CRITICAL FIX: Explicitly assert BigInt typing to prevent precision loss
        const [tokenAddresses, tokenBalances] = result as [`0x${string}`[], bigint[]];
        
        // DEBUG: Log the raw types and values to identify precision loss
        debugLog('🔍 Raw vault tokens result types:', {
          tokenAddressesType: typeof tokenAddresses,
          tokenBalancesType: typeof tokenBalances,
          tokenAddressesLength: tokenAddresses?.length,
          tokenBalancesLength: tokenBalances?.length,
          firstBalanceType: typeof tokenBalances?.[0],
          firstBalanceValue: tokenBalances?.[0]?.toString(),
          firstBalanceLength: tokenBalances?.[0]?.toString()?.length
        });
        
        debugLog('🔍 Raw vault tokens result:', { tokenAddresses, tokenBalances });
        
        // Process tokens with real metadata using the new function
        await processVaultTokensFromSignedCall(tokenAddresses, tokenBalances);
        return; // Exit early since we processed the result
      } else {
        debugLog(`ℹ️ Invalid result format for ${currentChain}:`, result);
        setVaultTokens([]);
      }
      
    } catch (error) {
      debugError('❌ Error fetching vault tokens with signed call:', error);
    } finally {
  // CRITICAL FIX: Always reset loading state to show refresh animation completion
      setIsLoadingVaultTokens(false);
    }
  };

  // Contract write hooks for real transactions.
  // writeVaultContractAsync is the SAME mutation as writeVaultContract —
  // both update the hook's `data: hash`, which feeds the
  // useWaitForTransactionReceipt → isConfirmed auto-refresh machinery.
  // The async variant additionally RETURNS the tx hash, which the
  // multi-token flows need to wait for the receipt inline so the
  // progress step only turns ✓ after real block confirmation.
  const { writeContract: writeVaultContract, writeContractAsync: writeVaultContractAsync, data: hash, isPending: isWritePending } = useWriteContract();
  
  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // CRITICAL FIX: Chain-specific transaction states to prevent cross-chain state pollution
  type ChainStates = {
    isLoading: boolean;
    isSimulating: boolean;
    hasRefreshedAfterConfirmation: boolean;
    lastTransactionHash: string | null;
  };
  
  const defaultChainState: ChainStates = {
    isLoading: false,
    isSimulating: false,
    hasRefreshedAfterConfirmation: false,
    lastTransactionHash: null
  };
  
  const [chainTransactionStates, setChainTransactionStates] = useState<Record<string, ChainStates>>({
    ETH: { ...defaultChainState },
    BSC: { ...defaultChainState },
    BASE: { ...defaultChainState },
    ARB: { ...defaultChainState },
    HYPER: { ...defaultChainState }
  });

  // Get current chain transaction state
  const isLoading = chainTransactionStates[activeChain].isLoading;
  const isSimulating = chainTransactionStates[activeChain].isSimulating;
  const hasRefreshedAfterConfirmation = chainTransactionStates[activeChain].hasRefreshedAfterConfirmation;
  const lastTransactionHash = chainTransactionStates[activeChain].lastTransactionHash;

  // CRITICAL: Only use Wagmi states if they belong to the current chain's transaction
  const isCurrentChainTransaction = hash === lastTransactionHash;
  const isWritePendingForCurrentChain = isWritePending && isCurrentChainTransaction;
  const isConfirmingForCurrentChain = isConfirming && isCurrentChainTransaction;

  // Update functions for specific chain
  const setIsLoading = useCallback((loading: boolean) => {
    setChainTransactionStates(prev => ({
      ...prev,
      [activeChain]: { ...prev[activeChain], isLoading: loading }
    }));
  }, [activeChain]);

  const setIsSimulating = useCallback((simulating: boolean) => {
    setChainTransactionStates(prev => ({
      ...prev,
      [activeChain]: { ...prev[activeChain], isSimulating: simulating }
    }));
  }, [activeChain]);

  const setHasRefreshedAfterConfirmation = useCallback((refreshed: boolean) => {
    setChainTransactionStates(prev => ({
      ...prev,
      [activeChain]: { ...prev[activeChain], hasRefreshedAfterConfirmation: refreshed }
    }));
  }, [activeChain]);

  // Track transaction hash for current chain
  const setLastTransactionHash = useCallback((transactionHash: string | null) => {
    setChainTransactionStates(prev => ({
      ...prev,
      [activeChain]: { ...prev[activeChain], lastTransactionHash: transactionHash }
    }));
  }, [activeChain]);

            // Track transaction hash when it changes to associate with current chain
            useEffect(() => {
              if (hash && hash !== lastTransactionHash) {
                if (process.env.NODE_ENV === 'development') {
                  debugLog(`🔗 New transaction hash for ${activeChain}: ${hash}`);
                }
                setLastTransactionHash(hash);
              }
            }, [hash, lastTransactionHash, activeChain, setLastTransactionHash]);

            // CRITICAL FIX: Clear transaction hash when switching chains
            useEffect(() => {
              // Clear the transaction hash when the active chain changes
              // This prevents stale transaction states from polluting other chains
              if (lastTransactionHash) {
                if (process.env.NODE_ENV === 'development') {
                  debugLog(`🧹 Clearing transaction hash ${lastTransactionHash} for chain switch to ${activeChain}`);
                }
                setLastTransactionHash(null);
              }
            }, [activeChain]); // Only depend on activeChain change

            // AGGRESSIVE FIX: Force clear ALL transaction states on chain switch
            useEffect(() => {
              // This effect runs whenever activeChain changes
              if (process.env.NODE_ENV === 'development') {
                debugLog(`🔄 AGGRESSIVE CLEANUP: Chain switched to ${activeChain}`);
              }
              
              // Force clear ALL chain transaction states
              setChainTransactionStates(prev => {
                const newStates = { ...prev };
                Object.keys(newStates).forEach(chain => {
                  newStates[chain] = {
                    isLoading: false,
                    isSimulating: false,
                    hasRefreshedAfterConfirmation: false,
                    lastTransactionHash: null
                  };
                });
                if (process.env.NODE_ENV === 'development') {
                  debugLog('🧹 AGGRESSIVE CLEANUP: All chain transaction states reset');
                }
                return newStates;
              });
              
            }, [activeChain]); // This will run on EVERY chain switch
  
  // State for tracking pending approvals that should trigger auto-deposit
  const [pendingApprovalForDeposit, setPendingApprovalForDeposit] = useState<{
    tokenAddress: string;
    amount: bigint;
    tokenSymbol: string;
    approvalHash: string;
  } | null>(null);
  
  // Token detection state
  const [walletTokens, setWalletTokens] = useState<Array<{address: string, symbol: string, balance: string, decimals: number}>>([]);
  const [vaultTokens, setVaultTokens] = useState<Array<{address: string, symbol: string, balance: string, decimals: number}>>([]);
  const [isLoadingWalletTokens, setIsLoadingWalletTokens] = useState(false);
  const [isLoadingVaultTokens, setIsLoadingVaultTokens] = useState(false);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false); // Keep for backward compatibility

  // CRITICAL FIX: Use full precision formatting instead of formatEther which rounds
  const walletBalanceFormatted = walletBalance ? formatTokenBalance(walletBalance.value.toString(), 18) : '0';
  
  // Debug logging to see what vaultBalanceData we're processing
  if (process.env.NODE_ENV === 'development' && vaultBalanceData) {
    console.log('🔍 useVault vaultBalanceData:', { 
      raw: vaultBalanceData, 
      asBigInt: (vaultBalanceData as bigint).toString(),
      type: typeof vaultBalanceData 
    });
  }
  
  // TEMPORARY TEST: Compare our function with formatEther to see the difference
      const vaultBalanceFormatted = vaultBalanceData ? formatTokenBalance(vaultBalanceData.toString(), 18) : '0';
  const vaultBalanceFormattedOld = vaultBalanceData ? formatEther(vaultBalanceData as bigint) : '0.000000000000000000';

  // Native (chain-currency) token entries for the multi-token pickers.
  // walletTokens / vaultTokens deliberately skip address 0x0 because the
  // single-asset UI shows the native balance separately at the top. But
  // CrossChainBank8.depositMultipleTokens / withdrawMultipleTokens /
  // transferMultipleTokensInternal all accept native alongside ERC-20s
  // in one atomic tx, and the multi-token modals need a way to pick it.
  // We expose pre-built entries here so Index.tsx can splice them into
  // the lists it passes down without touching the single-asset path.
  const walletNativeToken = walletBalance
    ? {
        address: '0x0000000000000000000000000000000000000000',
        symbol: getCurrentChainConfig().nativeCurrency.symbol,
        balance: walletBalance.value.toString(),
        decimals: walletBalance.decimals,
        isNative: true,
      }
    : null;
  const vaultNativeToken = vaultBalanceData != null
    ? {
        address: '0x0000000000000000000000000000000000000000',
        symbol: getCurrentChainConfig().nativeCurrency.symbol,
        balance: (vaultBalanceData as bigint).toString(),
        decimals: 18,
        isNative: true,
      }
    : null;
  
  // Debug logging to see the final formatted result
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 useVault vaultBalanceFormatted (NEW):', vaultBalanceFormatted);
    console.log('🔍 useVault vaultBalanceFormatted (OLD):', vaultBalanceFormattedOld);
    console.log('🔍 useVault vaultBalanceFormatted (RAW):', vaultBalanceData?.toString());
  }
  
  const currentFeeFormatted = currentFee ? formatTokenBalance(currentFee.toString(), 18) : '0';

  // Essential logging only - only log when state changes significantly
  if (process.env.NODE_ENV === 'development') {
    React.useEffect(() => {
      const currentState = {
        isConnected,
        walletBalance: walletBalanceFormatted,
        vaultBalance: vaultBalanceFormatted,
        currentFee: currentFeeFormatted,
        address
      };
      
      // Only log if this is the first time or if state changed significantly
      if (!(window as any).lastVaultState || JSON.stringify((window as any).lastVaultState) !== JSON.stringify(currentState)) {
        debugLog('Vault Hook State:', currentState);
        (window as any).lastVaultState = currentState;
      }
    }, [isConnected, walletBalanceFormatted, vaultBalanceFormatted, currentFeeFormatted, address]);
  }

  // Track when data loads/refetches (development only)
  if (process.env.NODE_ENV === 'development') {
    React.useEffect(() => {
      if (walletBalance) {
        debugLog('💰 Wallet balance loaded/updated:', weiToEtherFullPrecision(walletBalance.value));
      }
    }, [walletBalance]);

    React.useEffect(() => {
      if (vaultBalanceData) {
        debugLog('📊 Vault balance loaded/updated:', weiToEtherFullPrecision(vaultBalanceData as bigint));
      }
    }, [vaultBalanceData]);

    React.useEffect(() => {
      if (currentFee) {
        debugLog('💸 Current fee loaded/updated:', weiToEtherFullPrecision(currentFee as bigint));
      }
    }, [currentFee]);
  }

  // Helper function to get the correct Alchemy URL based on network mode
  const getAlchemyUrl = () => {
    // Use our dynamic RPC URL function that respects the active chain
    return getActiveRpcUrl();
  };
  
  // Function to get wallet tokens - chain-aware implementation
  const fetchWalletTokens = async () => {
    if (!address) return;
    
    try {
      setIsLoadingWalletTokens(true);
      debugLog('🔍 Fetching wallet tokens for address:', address);
      
      const chainConfig = getCurrentChainConfig();
      
      
      if (activeChain === 'ETH') {
        // Use Alchemy API for ETH chains
  
        const alchemyUrl = getActiveRpcUrl();

        
        // Use Alchemy API to get token balances
        const response = await fetch(alchemyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'alchemy_getTokenBalances',
            params: [address, 'erc20']
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          debugError('❌ HTTP error response:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const data = await response.json();
        
        if (data.error) {

        }

        if (data.result && data.result.tokenBalances) {
          debugLog('✅ Token balances found:', data.result.tokenBalances);
          await processAlchemyTokens(data.result.tokenBalances, alchemyUrl);
        }
        
      } else if (activeChain === 'BSC') {
        // Use Alchemy API for BSC chains (same as ETH, just different RPC)

        
        const alchemyUrl = getActiveRpcUrl();

        
        // Use Alchemy API to get token balances (same method as ETH)
        const response = await fetch(alchemyUrl, {
        method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'alchemy_getTokenBalances',
          params: [address, 'erc20']
        })
      });

        debugLog('📡 HTTP Response status:', response.status);
        debugLog('📡 HTTP Response headers:', response.headers);

        if (!response.ok) {
          const errorText = await response.text();
          debugError('❌ HTTP error response:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const data = await response.json();
        
        if (data.error) {
        }

        if (data.result && data.result.tokenBalances) {
          debugLog('✅ Token balances found:', data.result.tokenBalances);
          await processAlchemyTokens(data.result.tokenBalances, alchemyUrl);
        }
      } else if (activeChain === 'BASE' || activeChain === 'ARB') {
        // Use Alchemy API for BASE + ARB chains (Alchemy supports both —
        // same method as ETH/BSC, just different RPC URL).
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

        debugLog('📡 HTTP Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          debugError('❌ HTTP error response:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const data = await response.json();

        if (data.result && data.result.tokenBalances) {
          debugLog('✅ Token balances found:', data.result.tokenBalances);
          await processAlchemyTokens(data.result.tokenBalances, alchemyUrl);
        }
      } else if (activeChain === 'HYPER') {
        // HyperEVM has no Alchemy-style indexer — skip ERC-20 token enumeration.
        // Users can still deposit/withdraw the native token (HYPE) and any
        // ERC-20s they paste an address for, but the auto-populated token list
        // stays empty until a HyperEVM indexer (Pyth-Whirlpool?) ships.
        debugLog('🪙 HYPER: skipping ERC-20 enumeration (no indexer on HyperEVM)');
        setWalletTokens([]);
      }
      
    } catch (error) {
      debugError('❌ Error fetching wallet tokens:', error);
      setWalletTokens([]);
    } finally {
      setIsLoadingWalletTokens(false);
    }
  };

  // Helper function to process Alchemy API token data
  const processAlchemyTokens = async (tokenBalances: any[], alchemyUrl: string) => {
    const processedTokens = [];
    
    for (const token of tokenBalances) {
      try {
        // CRITICAL FIX: Parse hex balance to BigInt to preserve full precision
        const balanceHex = token.tokenBalance;
        const balanceBigInt = BigInt(balanceHex);
        
        // DEBUG: Log the exact values to verify precision preservation
        debugLog(`🔍 Processing wallet token ${token.contractAddress}:`, {
          hexBalance: balanceHex,
          bigIntBalance: balanceBigInt.toString(),
          bigIntLength: balanceBigInt.toString().length,
          hasScientificNotation: balanceBigInt.toString().includes('e+') || balanceBigInt.toString().includes('E+')
        });
        
        // Only process tokens with balance > 0
        if (balanceBigInt > 0n) {
          // Fetch token metadata (symbol, decimals)
          const metadataResponse = await fetch(alchemyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'alchemy_getTokenMetadata',
              params: [token.contractAddress]
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

          // CRITICAL FIX: Use the robust BigInt to string conversion function
          // This prevents scientific notation and preserves full precision
          const rawBalance = bigIntToFullPrecisionString(balanceBigInt);
          
          processedTokens.push({
            address: token.contractAddress,
            symbol: symbol,
            balance: rawBalance, // Store raw balance to preserve precision
            decimals: decimals
          });
          
          debugLog(`✅ Token processed: ${symbol} = ${rawBalance} raw units (${decimals} decimals)`);
        }
      } catch (error) {
        debugError(`❌ Error processing token ${token.contractAddress}:`, error);
      }
    }
    
    debugLog('✅ All tokens processed:', processedTokens);
    setWalletTokens(processedTokens);
  };

  // Process vault tokens data from contract
  React.useEffect(() => {
    const processVaultTokensData = async () => {
      debugLog('🔍 Vault tokens effect triggered with data:', vaultTokensData);
      debugLog('🔍 Vault tokens data type:', typeof vaultTokensData);
      debugLog('🔍 Vault tokens data is array:', Array.isArray(vaultTokensData));
      
      if (vaultTokensData && Array.isArray(vaultTokensData)) {
        debugLog('🔍 Processing vault tokens data:', vaultTokensData);
        
        // The contract returns [address[] tokens, uint256[] balances]
        const [tokenAddresses, tokenBalances] = vaultTokensData;
        
        debugLog('🔍 Token addresses:', tokenAddresses);
        debugLog('🔍 Token balances:', tokenBalances);
        debugLog('🔍 Addresses is array:', Array.isArray(tokenAddresses));
        debugLog('🔍 Balances is array:', Array.isArray(tokenBalances));
        
        if (Array.isArray(tokenAddresses) && Array.isArray(tokenBalances)) {
          // CRITICAL FIX: Use the working processVaultTokensFromSignedCall function instead
          // The old processVaultTokens function was never used and had bugs
          debugLog('🔄 Using processVaultTokensFromSignedCall for vault token processing...');
          await processVaultTokensFromSignedCall(tokenAddresses, tokenBalances);
        } else {
          debugLog('❌ Vault tokens data structure invalid:', { tokenAddresses, tokenBalances });
          setVaultTokens([]);
        }
      } else {
        // No vault tokens data available
        setVaultTokens([]);
        debugLog('ℹ️ No vault tokens data available');
      }
    };

    // Call the async function
    processVaultTokensData();
  }, [vaultTokensData]);

  // Auto-fetch wallet tokens when wallet connects
  React.useEffect(() => {
    if (address && isConnected) {
      fetchWalletTokens();
      fetchVaultTokensSigned(); // Also fetch vault tokens on connect
    }
  }, [address, isConnected]);

  // Manual test function for debugging
  React.useEffect(() => {
    // Add manual test function to window for debugging
    (window as any).testTokenFetching = () => {
      debugLog('🧪 Manual token fetching test...');
      debugLog('📍 Current address:', address);
      
      if (address) {
        fetchWalletTokens();
      } else {
        debugLog('❌ No wallet address available');
      }
    };

    // Add vault tokens test function
    (window as any).testVaultTokens = () => {
      debugLog('🧪 Manual vault tokens test...');
      debugLog('📍 Current address:', address);
      debugLog('🏦 Vault contract address:', getActiveContractAddress());
      debugLog('📊 Current vault tokens data:', vaultTokensData);
      debugLog('🪙 Current vault tokens state:', vaultTokens);
      
      if (address) {
        debugLog('🔄 Manually calling fetchVaultTokensSigned...');
        fetchVaultTokensSigned();
      } else {
        debugLog('❌ No wallet address available');
      }
    };

    debugLog('🧪 Token fetching test function available: window.testTokenFetching()');
    debugLog('🧪 Vault tokens test function available: window.testVaultTokens()');

    return () => {
      delete (window as any).testTokenFetching;
      delete (window as any).testVaultTokens;
    };
  }, [address, vaultTokensData, vaultTokens]);

  // Real ETH deposit function
  const depositETH = async (amount: string) => {
    if (!amount || isNaN(Number(amount))) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      // CRITICAL FIX: Always get fresh fee before transaction
      debugLog('💰 Getting fresh fee before ETH deposit...');
      const freshFee = await getCurrentFee();
      if (!freshFee) {
        throw new Error('Failed to get fresh fee');
      }
      
      // Update current fee state with fresh value
      setCurrentFee(freshFee);
      debugLog(`✅ Fresh fee obtained: ${formatEther(freshFee)} ETH`);
      
      // SIMULATION: Check if user has enough balance before proceeding
      setIsSimulating(true);
      
      const amountInWei = parseEther(amount);
      const feeInWei = freshFee;
      const totalValue = amountInWei + feeInWei;
      
      debugLog('🔍 Deposit Simulation:', {
        amount,
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString(),
        totalValue: totalValue.toString(),
        walletBalance: walletBalance ? walletBalance.value.toString() : 'null'
      });
      
      // Check if user has enough ETH for deposit + fee
      if (walletBalance && walletBalance.value < totalValue) {
        const required = formatEther(totalValue);
        const available = formatEther(walletBalance.value);
        debugLog('❌ Insufficient wallet balance for deposit:', { required, available });
      toast({
          title: "Insufficient Balance",
          description: `You need ${required} ETH (${amount} + ${weiToEtherFullPrecision(feeInWei)} fee). You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      debugLog('✅ Deposit simulation successful, proceeding with transaction');
      
      // Simulation successful - proceed with transaction
      setIsSimulating(false);
      setIsLoading(true);
      
      debugLog('Depositing ETH:', { 
        amount, 
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString(),
        totalValue: totalValue.toString()
      });
      
      // Call the real contract - send amount + fee together
      writeVaultContract({
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI as any,
        functionName: 'depositETH',
        args: [],
        value: totalValue, // Send amount + fee together
        chain: getTargetChain(),
        account: address,
      });

        toast({
        title: "Deposit Initiated",
        description: `Depositing ${amount} ETH + ${weiToEtherFullPrecision(feeInWei)} ETH fee to vault...`,
        });
      
    } catch (error) {
      debugError('Deposit error:', error);
      toast({
        title: "Deposit Failed",
        description: "Transaction failed or was rejected",
        variant: "destructive",
      });
      setIsLoading(false);
      setIsSimulating(false);
    }
  };

  // Real ETH withdrawal function
  const withdrawETH = async (amount: string) => {
    if (!amount || isNaN(Number(amount))) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      // CRITICAL FIX: Always get fresh fee before transaction
      debugLog('💰 Getting fresh fee before ETH withdrawal...');
      const freshFee = await getCurrentFee();
      if (!freshFee) {
        throw new Error('Failed to get fresh fee');
      }
      
      // Update current fee state with fresh value
      setCurrentFee(freshFee);
      debugLog(`✅ Fresh fee obtained: ${formatEther(freshFee)} ETH`);
      
      // SIMULATION: Check if user has enough vault balance before proceeding
      setIsSimulating(true);
      
      const amountInWei = parseEther(amount);
      const feeInWei = freshFee;
      
      debugLog('🔍 Withdrawal Simulation:', {
        amount,
        amountInWei: amountInWei.toString(),
        vaultBalanceData: vaultBalanceData ? (vaultBalanceData as bigint).toString() : 'null',
        feeInWei: feeInWei.toString(),
        walletBalance: walletBalance ? walletBalance.value.toString() : 'null'
      });
      
      // Check if user has enough ETH in vault for withdrawal
      if ((vaultBalanceData as bigint) < amountInWei) {
        const available = weiToEtherFullPrecision(vaultBalanceData as bigint);
        debugLog('❌ Insufficient vault balance:', { available, requested: amount });
      toast({
          title: "Insufficient Vault Balance",
          description: `You only have ${available} ETH in vault. Cannot withdraw ${amount} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      // Check if user has enough ETH for fee
      if (walletBalance && walletBalance.value < feeInWei) {
        const feeRequired = weiToEtherFullPrecision(feeInWei);
        const available = weiToEtherFullPrecision(walletBalance.value);
        debugLog('❌ Insufficient wallet balance for fee:', { feeRequired, available });
        toast({
          title: "Insufficient Balance for Fee",
          description: `You need ${feeRequired} ETH for the withdrawal fee. You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      debugLog('✅ Withdrawal simulation successful, proceeding with transaction');
      
      // Simulation successful - proceed with transaction
      setIsSimulating(false);
      setIsLoading(true);
      
      debugLog('Withdrawing ETH:', { 
        amount, 
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString()
      });
      
      // Call the real contract - send fee with withdrawal
      writeVaultContract({
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI as any,
        functionName: 'withdrawETH',
        args: [amountInWei],
        value: feeInWei, // Send fee with withdrawal transaction
        chain: getTargetChain(),
        account: address,
      });

      toast({
        title: "Withdrawal Initiated",
        description: `Withdrawing ${amount} ETH (fee: ${weiToEtherFullPrecision(feeInWei)} ETH)...`,
      });
      
    } catch (error) {
      debugError('Withdrawal error:', error);
      toast({
        title: "Withdrawal Failed",
        description: "Transaction failed or was rejected",
        variant: "destructive",
      });
      setIsLoading(false);
      setIsSimulating(false);
    }
  };

  // NEW: Wagmi-based ETH withdrawal for comparison with custom implementation
  const withdrawETHWagmi = async (
    amount: string,
    onProgress?: (steps: _PS[]) => void,
  ) => {
    if (!amount || isNaN(Number(amount))) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      // CRITICAL FIX: Always get fresh fee before transaction
      debugLog('💰 Getting fresh fee before ETH withdrawal (Wagmi)...');
      const freshFee = await getCurrentFee();
      if (!freshFee) {
        throw new Error('Failed to get fresh fee');
      }
      
      // Update current fee state with fresh value
      setCurrentFee(freshFee);
      debugLog(`✅ Fresh fee obtained: ${formatEther(freshFee)} ETH`);
      
      // SIMULATION: Check if user has enough vault balance before proceeding
      setIsSimulating(true);
      
      const amountInWei = parseEther(amount);
      const feeInWei = freshFee;
      
      debugLog('🔍 Withdrawal Simulation (Wagmi):', {
        amount,
        amountInWei: amountInWei.toString(),
        vaultBalanceData: vaultBalanceData ? (vaultBalanceData as bigint).toString() : 'null',
        feeInWei: feeInWei.toString(),
        walletBalance: walletBalance ? walletBalance.value.toString() : 'null'
      });
      
      // Check if user has enough ETH in vault for withdrawal
      if ((vaultBalanceData as bigint) < amountInWei) {
        const available = weiToEtherFullPrecision(vaultBalanceData as bigint);
        debugLog('❌ Insufficient vault balance:', { available, requested: amount });
        toast({
          title: "Insufficient Vault Balance",
          description: `You only have ${available} ETH in vault. Cannot withdraw ${amount} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      // Check if user has enough ETH for fee
      if (walletBalance && walletBalance.value < feeInWei) {
        const feeRequired = weiToEtherFullPrecision(feeInWei);
        const available = weiToEtherFullPrecision(walletBalance.value);
        debugLog('❌ Insufficient wallet balance for fee:', { feeRequired, available });
        toast({
          title: "Insufficient Balance for Fee",
          description: `You need ${feeRequired} ETH for the withdrawal fee. You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      debugLog('✅ Withdrawal simulation successful, proceeding with transaction (Wagmi)');
      
      // Simulation successful - proceed with transaction
      setIsSimulating(false);
      setIsLoading(true);
      
      debugLog('Withdrawing ETH via Wagmi:', {
        amount,
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString()
      });

      // 3-step lifecycle, same shape as depositETHWagmi.
      const lc = buildTxLifecycle(onProgress);
      try {
        lc.set(0, 'running', `Open your wallet and sign withdrawETH(${amount})…`);
        // @wagmi/core writeContract action — independent per call (NO
        // shared mutation state). Replaces writeVaultContractAsync so
        // a second concurrent single-asset call (e.g. open Deposit USD1
        // while a WLFI withdraw is still pending) doesn't race the
        // shared react-query mutation and clobber both flows.
        const txHash = await writeContract(config, {
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI as any,
          functionName: 'withdrawETH',
          args: [amountInWei],
          value: feeInWei,
        });
        lc.set(0, 'done', `Signed & broadcast — tx ${String(txHash).slice(0, 10)}…`);
        lc.advance(1);
        lc.set(1, 'running', 'Waiting for on-chain confirmation…');
        const receipt = await waitForTransactionReceipt(config, { hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error(`withdrawETH reverted on-chain (block ${receipt.blockNumber})`);
        }
        lc.set(1, 'done', `Confirmed in block ${receipt.blockNumber}`);
        // Release the app-wide isLoading flag as soon as the chain
        // says success — don't wait for the isConfirmed useEffect to
        // catch up (it can lag the explicit waitForTransactionReceipt
        // by hundreds of ms, leaving every per-token button on the
        // home page greyed out during the 12s finality wait).
        setIsLoading(false);

        if (SHOW_LIFECYCLE_CONFIRMATION_TOASTS) {
          toast({
            title: "Withdrawal Confirmed",
            description: `Withdrew ${amount} ETH from vault`,
          });
        }

        lc.advance(2);
        const finality = getChainFinalityDelay();
        lc.set(2, 'running', `Waiting ${finality / 1000}s for ${activeChain} chain finality, then updating balances…`);
        await new Promise(resolve => setTimeout(resolve, finality));
        // Single-asset hooks use @wagmi/core's writeContract action
        // (no shared mutation state), which means the legacy
        // isConfirmed useEffect that did these refetches doesn't fire
        // for our hash. Do them here so balances/fee/token-lists land.
        refreshAfterTx();
        lc.set(2, 'done', 'Balances updated ✓');
      } catch (innerError: any) {
        lc.set(lc.getPhase(), 'failed', innerError?.shortMessage || innerError?.message || 'Withdrawal failed');
        throw innerError;
      }

    } catch (error) {
      debugError('Withdrawal error (Wagmi):', error);
      toast({
        title: "Withdrawal Failed (Wagmi)",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      setIsSimulating(false);
      setIsLoading(false);
    }
  };

  // Real anonymous ETH transfer function
  const transferETH = async (to: string, amount: string) => {
    if (!to || !amount || isNaN(Number(amount))) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid address and amount",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    // Validate Ethereum address
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid Ethereum address",
        variant: "destructive",
      });
      return;
    }

    try {
      // SIMULATION: Check if user has enough vault balance before proceeding
      setIsSimulating(true);
      
      const amountInWei = parseEther(amount);
      const feeInWei = currentFee ? (currentFee as bigint) : 0n;
      
      debugLog('🔍 Transfer Simulation:', {
        to,
        amount,
        amountInWei: amountInWei.toString(),
        vaultBalanceData: vaultBalanceData ? (vaultBalanceData as bigint).toString() : 'null',
        feeInWei: feeInWei.toString(),
        walletBalance: walletBalance ? walletBalance.value.toString() : 'null'
      });
      
      // Check if user has enough ETH in vault for transfer
      if ((vaultBalanceData as bigint) < amountInWei) {
        const available = weiToEtherFullPrecision(vaultBalanceData as bigint);
        debugLog('❌ Insufficient vault balance for transfer:', { available, requested: amount });
      toast({
          title: "Insufficient Vault Balance",
          description: `You only have ${available} ETH in vault. Cannot transfer ${amount} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      // Check if user has enough ETH for fee
      if (walletBalance && walletBalance.value < feeInWei) {
        const feeRequired = weiToEtherFullPrecision(feeInWei);
        const available = weiToEtherFullPrecision(walletBalance.value);
        debugLog('❌ Insufficient wallet balance for transfer fee:', { feeRequired, available });
        toast({
          title: "Insufficient Balance for Fee",
          description: `You need ${feeRequired} ETH for the transfer fee. You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      debugLog('✅ Transfer simulation successful, proceeding with transaction');
      
      // Simulation successful - proceed with transaction
      setIsSimulating(false);
      setIsLoading(true);
      
      debugLog('Transferring ETH:', { 
        to, 
        amount, 
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString()
      });
      
      // Call the real contract for anonymous transfer - send fee with transfer
      writeVaultContract({
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI as any,
        functionName: 'transferInternalETH',
        args: [to as `0x${string}`, amountInWei],
        value: feeInWei, // Send fee with transfer transaction
        chain: getTargetChain(),
        account: address,
      });

      toast({
        title: "Transfer Initiated",
        description: `Transferring ${amount} ETH to ${to.slice(0, 6)}...${to.slice(-4)} (fee: ${weiToEtherFullPrecision(feeInWei)} ETH)`,
      });
      
    } catch (error) {
      debugError('Transfer error:', error);
      toast({
        title: "Transfer Failed",
        description: "Transaction failed or was rejected",
        variant: "destructive",
      });
      setIsLoading(false);
      setIsSimulating(false);
    }
  };

  // NEW: Wagmi-based ETH transfer for comparison with custom implementation
  const transferInternalETHWagmi = async (
    to: string,
    amount: string,
    onProgress?: (steps: _PS[]) => void,
  ) => {
    if (!to || !amount || isNaN(Number(amount))) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid address and amount",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    // Validate Ethereum address
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      toast({
        title: "Invalid Address",
        description: "Please enter a valid Ethereum address",
        variant: "destructive",
      });
      return;
    }

    try {
      // SIMULATION: Check if user has enough vault balance before proceeding
      setIsSimulating(true);
      
      const amountInWei = parseEther(amount);
      const feeInWei = currentFee ? (currentFee as bigint) : 0n;
      
      debugLog('🔍 Transfer Simulation (Wagmi):', {
        to,
        amount,
        amountInWei: amountInWei.toString(),
        vaultBalanceData: vaultBalanceData ? (vaultBalanceData as bigint).toString() : 'null',
        feeInWei: feeInWei.toString(),
        walletBalance: walletBalance ? walletBalance.value.toString() : 'null'
      });
      
      // Check if user has enough ETH in vault for transfer
      if ((vaultBalanceData as bigint) < amountInWei) {
        const available = weiToEtherFullPrecision(vaultBalanceData as bigint);
        debugLog('❌ Insufficient vault balance for transfer:', { available, requested: amount });
        toast({
          title: "Insufficient Vault Balance",
          description: `You only have ${available} ETH in vault. Cannot transfer ${amount} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      // Check if user has enough ETH for fee
      if (walletBalance && walletBalance.value < feeInWei) {
        const feeRequired = weiToEtherFullPrecision(feeInWei);
        const available = weiToEtherFullPrecision(walletBalance.value);
        debugLog('❌ Insufficient wallet balance for transfer fee:', { feeRequired, available });
        toast({
          title: "Insufficient Balance for Fee",
          description: `You need ${feeRequired} ETH for the transfer fee. You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      debugLog('✅ Transfer simulation successful, proceeding with transaction (Wagmi)');
      
      // Simulation successful - proceed with transaction
      setIsSimulating(false);
      setIsLoading(true);
      
      debugLog('Transferring ETH via Wagmi:', {
        to,
        amount,
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString()
      });

      // 3-step lifecycle, same shape as the deposit/withdraw twins.
      const lc = buildTxLifecycle(onProgress);
      try {
        lc.set(0, 'running', `Open your wallet and sign transferInternalETH(${amount} → ${to.slice(0, 6)}…${to.slice(-4)})…`);
        // @wagmi/core action — independent per call (no shared mutation).
        const txHash = await writeContract(config, {
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI as any,
          functionName: 'transferInternalETH',
          args: [to as `0x${string}`, amountInWei],
          value: feeInWei,
        });
        lc.set(0, 'done', `Signed & broadcast — tx ${String(txHash).slice(0, 10)}…`);
        lc.advance(1);
        lc.set(1, 'running', 'Waiting for on-chain confirmation…');
        const receipt = await waitForTransactionReceipt(config, { hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error(`transferInternalETH reverted on-chain (block ${receipt.blockNumber})`);
        }
        lc.set(1, 'done', `Confirmed in block ${receipt.blockNumber}`);
        // Release the app-wide isLoading flag as soon as the chain
        // says success — don't wait for the isConfirmed useEffect to
        // catch up (it can lag the explicit waitForTransactionReceipt
        // by hundreds of ms, leaving every per-token button on the
        // home page greyed out during the 12s finality wait).
        setIsLoading(false);

        if (SHOW_LIFECYCLE_CONFIRMATION_TOASTS) {
          toast({
            title: "Transfer Confirmed",
            description: `Transferred ${amount} ETH to ${to.slice(0, 6)}...${to.slice(-4)}`,
          });
        }

        lc.advance(2);
        const finality = getChainFinalityDelay();
        lc.set(2, 'running', `Waiting ${finality / 1000}s for ${activeChain} chain finality, then updating balances…`);
        await new Promise(resolve => setTimeout(resolve, finality));
        // Single-asset hooks use @wagmi/core's writeContract action
        // (no shared mutation state), which means the legacy
        // isConfirmed useEffect that did these refetches doesn't fire
        // for our hash. Do them here so balances/fee/token-lists land.
        refreshAfterTx();
        lc.set(2, 'done', 'Balances updated ✓');
      } catch (innerError: any) {
        lc.set(lc.getPhase(), 'failed', innerError?.shortMessage || innerError?.message || 'Transfer failed');
        throw innerError;
      }

    } catch (error) {
      debugError('Transfer error (Wagmi):', error);
      toast({
        title: "Transfer Failed (Wagmi)",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      setIsLoading(false);
      setIsSimulating(false);
    }
  };

  // Token approval hook (Wagmi-based)
  const approveTokenWagmi = async (tokenAddress: string, amount: bigint) => {
    if (!address) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return false;
    }

    try {
      debugLog(`🔐 Approving token ${tokenAddress} for amount ${amount}`);
      
      // Use the write contract hook for approval
      const approvalResult = await writeVaultContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": false,
            "inputs": [
              {"name": "spender", "type": "address"},
              {"name": "amount", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"name": "", "type": "bool"}],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [
          getActiveContractAddress() as `0x${string}`,
          amount
        ],
        chain: getTargetChain(),
        account: address,
      });

      debugLog(`✅ Token approval transaction sent: ${approvalResult}`);
      return true;
      
    } catch (error) {
      debugError('❌ Token approval error:', error);
      toast({
        title: "Error",
        description: "Failed to approve token",
        variant: "destructive",
      });
      return false;
    }
  };

  // Extended deposit function for tokens (Wagmi-based)
  const depositTokenWagmi = async (tokenAddress: string, amount: string, tokenSymbol: string) => {
    if (!address) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      debugLog(`💰 Depositing ${amount} ${tokenSymbol} to vault`);

      // Step 1: Get token decimals (like transferInternalToken)
      const decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": true,
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "type": "function"
          }
        ],
        functionName: 'decimals',
      }) as number;

      debugLog(`🔍 Token ${tokenSymbol} decimals:`, decimals);

      // Step 2: Convert amount using proper decimals - PRECISION SAFE
      const amountWei = convertToWei(amount, decimals);
      debugLog(`💰 Amount in wei:`, amountWei.toString());

      // ✅ NEW: WALLET BALANCE VALIDATION - Check if user has enough tokens BEFORE approval
      debugLog(`🔍 Checking wallet balance for ${tokenSymbol}...`);
      try {
        const walletTokenBalance = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: [
            {
              "constant": true,
              "inputs": [{"name": "_owner", "type": "address"}],
              "name": "balanceOf",
              "outputs": [{"name": "", "type": "uint256"}],
              "type": "function"
            }
          ],
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;

        debugLog(`🔍 Wallet ${tokenSymbol} balance:`, walletTokenBalance.toString());
        debugLog(`🔍 Amount to deposit:`, amountWei.toString());

        if (walletTokenBalance < amountWei) {
          const available = formatUnits(walletTokenBalance, decimals);
          toast({
            title: "Insufficient Token Balance",
            description: `You only have ${available} ${tokenSymbol}. Cannot deposit ${amount} ${tokenSymbol}.`,
            variant: "destructive",
          });
          setIsLoading(false);
          return; // ❌ Block transaction - user saves gas
        }

        debugLog(`✅ Sufficient ${tokenSymbol} balance confirmed`);
      } catch (balanceError) {
        debugError('❌ Failed to check wallet balance:', balanceError);
        toast({
          title: "Balance Check Failed",
          description: `Could not verify your ${tokenSymbol} balance. Please try again.`,
          variant: "destructive",
        });
        setIsLoading(false);
        return; // ❌ Block transaction - user saves gas
      }

      // ✅ NEW: PRE-SIMULATION - Check if transaction will succeed
      debugLog(`🔍 Pre-simulating token deposit transaction...`);
      try {
        const { request } = await publicClient.simulateContract({
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'depositToken',
          args: [tokenAddress, amountWei],
          account: address,
          value: currentFee as bigint,
        });
        debugLog(`✅ Pre-simulation successful - transaction will succeed`);
      } catch (simulationError) {
        debugError('❌ Pre-simulation failed:', simulationError);
        
        // Check if it's a balance/allowance issue
        if (simulationError instanceof Error) {
          if (simulationError.message.includes('insufficient') || simulationError.message.includes('balance')) {
            toast({
              title: "Insufficient Balance",
              description: `You don't have enough ${tokenSymbol} to deposit this amount.`,
              variant: "destructive",
            });
          } else if (simulationError.message.includes('allowance') || simulationError.message.includes('approve')) {
            toast({
              title: "Approval Required",
              description: `Please approve ${tokenSymbol} spending first.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Transaction Will Fail",
              description: `Pre-simulation failed: ${simulationError.message}`,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Transaction Will Fail",
            description: "Pre-simulation failed - transaction would not succeed",
            variant: "destructive",
          });
        }
        
        setIsLoading(false);
        return; // ❌ Block transaction - user saves gas
      }

      // Step 3: First approve the token. Per the unified policy (2026-06-07)
      // we always max-approve (MAX_UINT256) — eliminates the decimal-comma-typo
      // risk and means the user never has to approve this token again on this
      // vault contract for any future deposit, regardless of amount.
      const approved = await approveTokenWagmi(tokenAddress, 2n ** 256n - 1n);
      if (!approved) {
        setIsLoading(false);
        return;
      }

      // Step 4: Then deposit to vault (this would call your vault contract)
      debugLog(`✅ Token approved, proceeding with deposit...`);
      
      // Get current fee for the transaction
      if (!currentFee) {
        throw new Error('Current fee not available');
      }
      
      const feeWei = currentFee as bigint;
      debugLog(`💰 Current fee: ${feeWei} wei (${formatEther(feeWei)} ETH)`);
      
      // Call the actual vault deposit function WITH ETH fee
      await writeVaultContract({
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'depositToken',
        args: [tokenAddress, amountWei],
        chain: getTargetChain(),
        account: address,
        value: feeWei, // Send ETH fee along with token deposit
      });
      
      debugLog(`📝 Token deposit transaction initiated with ETH fee`);
      
      toast({
        title: "Token Deposit Initiated",
        description: `Depositing ${amount} ${tokenSymbol} + ${formatEther(feeWei)} ETH fee to vault...`,
      });
      
      // DON'T refresh here - let the transaction confirmation system handle it
      // This matches the ETH deposit flow exactly
      
      // DON'T set isLoading(false) here - let the transaction confirmation system handle it
      // This matches the ETH deposit flow exactly
      
    } catch (error) {
      debugError('❌ Token deposit error:', error);
      toast({
        title: "Error",
        description: `Failed to deposit ${tokenSymbol}`,
        variant: "destructive",
      });
      setIsLoading(false); // Only reset loading on error
    }
    // Remove the finally block - let transaction confirmation handle loading state
  };

  // NEW: Smart token deposit with automatic allowance checking and auto-deposit
  //
  // onProgress (2026-06-10): forwarded to executeTokenDeposit when the
  // token is already approved (the common case — max-approve is sticky).
  // For the FIRST deposit of a token that needs a fresh approve, the
  // legacy executeTokenApprovalAndDeposit setTimeout state machine
  // still owns the flow and shows only its toast-based feedback. That
  // path is a separate refactor — flagged in the commit message.
  const depositTokenSmartWagmi = async (
    tokenAddress: string,
    amount: string,
    tokenSymbol: string,
    onProgress?: (steps: _PS[]) => void,
  ) => {
    if (!address) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      debugLog(`🧠 Smart deposit for ${amount} ${tokenSymbol}`);

      // Step 1: Get token decimals (like other functions)
      const decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": true,
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "type": "function"
          }
        ],
        functionName: 'decimals',
      }) as number;

      debugLog(`🔍 Token ${tokenSymbol} decimals:`, decimals);

      // Step 2: Convert amount using proper decimals - PRECISION SAFE
      const amountWei = convertToWei(amount, decimals);
      debugLog(`💰 Amount in wei:`, amountWei.toString());

      // Step 3: Check current allowance
      debugLog(`🔍 Checking current allowance for ${tokenSymbol}...`);
      const currentAllowance = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": true,
            "inputs": [
              {"name": "owner", "type": "address"},
              {"name": "spender", "type": "address"}
            ],
            "name": "allowance",
            "outputs": [{"name": "", "type": "uint256"}],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
          }
        ],
        functionName: 'allowance',
        args: [address, getActiveContractAddress() as `0x${string}`],
      });

      debugLog(`📊 Current allowance: ${currentAllowance}, Required: ${amountWei}`);

      // Step 4: Check if approval is needed
      if ((currentAllowance as bigint) >= amountWei) {
        debugLog(`✅ Sufficient allowance (${currentAllowance}), proceeding directly to deposit`);
        // Skip approval, go straight to deposit — wire progress through.
        await executeTokenDeposit(tokenAddress, amountWei, tokenSymbol, onProgress);
      } else {
        debugLog(`❌ Insufficient allowance (${currentAllowance} < ${amountWei}), approval needed`);
        // Need approval first, then auto-deposit after confirmation
        await executeTokenApprovalAndDeposit(tokenAddress, amountWei, tokenSymbol);
      }

    } catch (error) {
      debugError('❌ Smart token deposit error:', error);
      toast({
        title: "Error",
        description: `Failed to deposit ${tokenSymbol}`,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // SIMPLE APPROACH: 3-second delay between approval and deposit
  const getRateLimitStatus = async (): Promise<{
    remaining: number;
    total: number;
    resetTime: number;
  } | null> => {
    try {
      if (!address) return null;

      // For now, return a mock rate limit status
      // In a real implementation, you would call the contract to get actual rate limit data
      const now = Date.now();
      const resetTime = now + (60 * 1000); // Reset in 60 seconds

      return {
        remaining: Math.floor(Math.random() * 1000), // Mock remaining transactions
        total: 1000,
        resetTime
      };
    } catch (error) {
      debugLog(`❌ Error getting rate limit status: ${error}`);
      return null;
    }
  };

  // Optional `onProgress` callback: when provided, the function reports a
  // WLFI-style step progression for the multi-token deposit flow. The shape
  // mirrors src/components/shared/ProgressFlow.tsx's ProgressStep[] —
  // {label, status, detail?}. The caller (MultiTokenDepositModal) renders
  // the ProgressFlow component using each setSteps snapshot.
  type _PSStatus = 'pending' | 'running' | 'done' | 'failed';
  type _PS = { label: string; status: _PSStatus; detail?: string };

  // Single-asset tx lifecycle helper — used by depositETHWagmi /
  // withdrawETHWagmi / transferInternalETHWagmi and their token-side
  // twins. Builds the canonical 3-step indicator
  //
  //   [0] Sign in wallet      — running while wallet popup is open
  //   [1] Confirm on-chain    — running while in mempool, ✓ on receipt
  //   [2] Finalize & refresh  — running through getChainFinalityDelay,
  //                             ✓ after balances are refetched
  //
  // and returns a small driver object so each hook's body becomes
  // mechanical. The helper is a no-op when onProgress is undefined,
  // so existing callers (e.g. internal helpers that don't drive a
  // popup) keep working untouched.
  // Called by every single-asset lifecycle after the finality delay,
  // to bring balances/fee/token lists in sync. With single-asset hooks
  // switching to @wagmi/core's writeContract action (independent per
  // call — no shared mutation state), the legacy isConfirmed effect
  // that did these refetches no longer fires for these flows, so we
  // do them here explicitly. Same calls that effect made; just inline.
  const refreshAfterTx = () => {
    refetchVaultBalance();
    refetchWalletBalance();
    refetchFee();
    fetchWalletTokens();
    fetchVaultTokensSigned();
  };

  const buildTxLifecycle = (onProgress?: (steps: _PS[]) => void) => {
    const steps: _PS[] = [
      { label: 'Sign in wallet',     status: 'pending' },
      { label: 'Confirm on-chain',   status: 'pending' },
      { label: 'Finalize & refresh', status: 'pending' },
    ];
    let phase = 0;
    const emit = () => onProgress?.(steps.map(s => ({ ...s })));
    return {
      // Move the "currently running step" pointer. The catch block in
      // each hook reads getPhase() to know which dot to flag red.
      advance(i: number) { phase = i; },
      getPhase() { return phase; },
      // Set the status/detail of a specific step and re-emit.
      set(i: number, status: _PSStatus, detail?: string) {
        steps[i] = { ...steps[i], status, ...(detail !== undefined ? { detail } : {}) };
        emit();
      },
    };
  };

  const depositMultipleTokensWagmi = async (
    deposits: { token: string; amount: string }[],
    onProgress?: (steps: _PS[]) => void,
  ) => {
    console.log('depositMultipleTokens called with:', deposits);
    console.log('Address:', address);
    console.log('Is connected:', isConnected);

    if (!address || !isConnected) {
      console.log('Wallet not connected - returning early');
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to deposit tokens",
        variant: "destructive",
      });
      return;
    }

    console.log('Checking deposits length:', deposits.length);
    if (deposits.length === 0) {
      console.log('No deposits specified');
      toast({
        title: "No deposits specified",
        description: "Please select at least one token to deposit",
        variant: "destructive",
      });
      return;
    }

    if (deposits.length > 25) {
      console.log('Too many tokens:', deposits.length);
      toast({
        title: "Too many tokens",
        description: "Maximum 25 tokens per transaction",
        variant: "destructive",
      });
      return;
    }

    // EMIT FIRST — render the progress modal IMMEDIATELY so the user
    // sees feedback before any RPC reads start. On slow connections,
    // fetching balances/allowances/fee can take 2-5 seconds, and
    // without this the modal wouldn't appear until after that work
    // completes. We push a single "Preparing…" step now; the real
    // step list is computed and emitted below once allowances are
    // checked, replacing this placeholder.
    onProgress?.([{ label: 'Preparing deposit…', status: 'running', detail: `Checking balances and allowances for ${deposits.length} token${deposits.length === 1 ? '' : 's'}…` }]);

    try {
      // ONE atomic call (2026-06-10): Bank8 handles mixed native + ERC-20
      // batches natively since the 2026-05-31 mixed-batch contract fix —
      // native entries ride in the same tokens/amounts arrays as
      // address(0) and the contract takes their sum from msg.value.
      // The old frontend-side ETH-split (separate depositETH txs before
      // the batch) predates that fix: it cost extra signatures + gas and
      // its txs never appeared in the step indicator. Mirrors debug UI b8-4.
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
      const tokens: string[] = [];
      const amounts: string[] = [];
      let nativeSum = 0n;

      for (const d of deposits) {
        const tokenAddress = typeof d.token === 'string' ? d.token : d.token.address;
        if (tokenAddress === ZERO_ADDRESS) {
          // Native (ETH/BNB/HYPE…) — always 18 decimals on our chains.
          const wei = parseEther(d.amount);
          tokens.push(ZERO_ADDRESS);
          amounts.push(wei.toString());
          nativeSum += wei;
        } else {
          const tokenInfo = walletTokens.find(t => t.address === tokenAddress);
          const decimals = tokenInfo?.decimals || 18;
          tokens.push(tokenAddress);
          amounts.push(convertToWei(d.amount, decimals).toString());
        }
      }

      console.log(`🔍 Atomic batch: ${tokens.length} entries, native sum ${formatEther(nativeSum)}`);

      // CRITICAL FIX: Robust fee management for multi-token deposits
      let feeInWei = currentFee ? (currentFee as bigint) : 0n;
      
      // If no fee available, get fresh fee
      if (feeInWei === 0n) {
        console.log('🔄 No cached fee, getting fresh fee...');
        const freshFee = await getCurrentFee();
        if (freshFee) {
          feeInWei = freshFee;
          console.log(`✅ Fresh fee obtained: ${formatEther(feeInWei)} ETH`);
        } else {
          console.log('⚠️ Still no fee available, using fallback');
          feeInWei = parseEther('0.001'); // Fallback fee
        }
      }
      
      console.log('💸 Final fee value:', formatEther(feeInWei));

      // msg.value = sum of native deposits + dynamic fee — exactly what
      // the contract's mixed-batch accounting expects.
      const totalEthValue = nativeSum + feeInWei;
      console.log('💵 Total msg.value (native sum + fee):', formatEther(totalEthValue));

      // Wallet must cover natives + fee (gas is on top, wallet estimates that).
      if (walletBalance && walletBalance.value < totalEthValue) {
        toast({
          title: "Insufficient Balance",
          description: `You need ${formatEther(totalEthValue)} ETH (deposits + fee). You have ${formatEther(walletBalance.value)} ETH.`,
          variant: "destructive",
        });
        return;
      }

      // Check and handle approvals for all token deposits
      console.log('🔐 Checking approvals for token deposits...');
      const approvalTokenDeposits = deposits.filter(d => {
        const tokenAddress = typeof d.token === 'string' ? d.token : d.token.address;
        return tokenAddress !== '0x0000000000000000000000000000000000000000';
      });

      // === ProgressFlow scaffolding (2026-06-08) ===
      // Build the steps array UPFRONT so the modal can show the full flow
      // before any tx fires. Approval steps are added only for tokens that
      // need a fresh approve (allowance < required); already-approved tokens
      // are noted but don't get their own step (no signature involved).
      // The final step is always the multi-token deposit itself.
      const _progressSteps: _PS[] = [];
      const _ercNeedingApprove: { address: string; symbol: string }[] = [];

      for (const deposit of approvalTokenDeposits) {
        const tokenAddress = typeof deposit.token === 'string' ? deposit.token : deposit.token.address;
        const tokenInfo = walletTokens.find(t => t.address === tokenAddress);
        const decimals = tokenInfo?.decimals || 18;
        const requiredAmount = convertToWei(deposit.amount, decimals);
        try {
          const cur = await readContract(config, {
            address: tokenAddress as `0x${string}`,
            abi: [{ inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
            functionName: 'allowance',
            args: [address, getActiveContractAddress()],
          });
          if (BigInt(cur as string) < requiredAmount) {
            const symbol = tokenInfo?.symbol || tokenAddress.slice(0, 6) + '…';
            _ercNeedingApprove.push({ address: tokenAddress, symbol });
            _progressSteps.push({ label: `Approve ${symbol}`, status: 'pending' });
          }
        } catch (_e) {
          // If we can't pre-check, assume it needs an approve — better safe than sorry.
          const symbol = tokenInfo?.symbol || tokenAddress.slice(0, 6) + '…';
          _ercNeedingApprove.push({ address: tokenAddress, symbol });
          _progressSteps.push({ label: `Approve ${symbol}`, status: 'pending' });
        }
      }
      // The final tx renders as THREE honest lifecycle steps (mirrors
      // debug UI b8-4): sign (wallet popup) → confirm (mempool → mined)
      // → finalize (chain propagation delay + balance refresh). Each
      // turns ✓ only when its real signal fires.
      _progressSteps.push({ label: 'Sign in wallet', status: 'pending' });
      _progressSteps.push({ label: 'Confirm on-chain', status: 'pending' });
      _progressSteps.push({ label: 'Finalize & refresh', status: 'pending' });
      onProgress?.(_progressSteps.map(s => ({ ...s })));

      let _approveIdx = 0;

      for (const deposit of approvalTokenDeposits) {
        const tokenAddress = typeof deposit.token === 'string' ? deposit.token : deposit.token.address;

        try {
          // Check current allowance using readContract
          const currentAllowance = await readContract(config, {
            address: tokenAddress as `0x${string}`,
            abi: [
              {
                inputs: [
                  { name: 'owner', type: 'address' },
                  { name: 'spender', type: 'address' }
                ],
                name: 'allowance',
                outputs: [{ name: '', type: 'uint256' }],
                stateMutability: 'view',
                type: 'function'
              }
            ],
            functionName: 'allowance',
            args: [address, getActiveContractAddress()],
          });

          // Get token decimals for proper amount calculation
          const tokenInfo = walletTokens.find(t => t.address === tokenAddress);
          const decimals = tokenInfo?.decimals || 18;
          const requiredAmount = convertToWei(deposit.amount, decimals);
          console.log(`  ${tokenAddress}: Current allowance: ${currentAllowance}, Required: ${requiredAmount}`);

          if (BigInt(currentAllowance as string) < requiredAmount) {
            console.log(`  🔄 Approving ${tokenAddress}...`);
            // Progress emit: start of this approve step
            if (_approveIdx < _ercNeedingApprove.length) {
              _progressSteps[_approveIdx] = {
                ..._progressSteps[_approveIdx],
                status: 'running',
                detail: `Approving ${_ercNeedingApprove[_approveIdx].symbol} (MAX_UINT256) — open wallet to sign…`,
              };
              onProgress?.(_progressSteps.map(s => ({ ...s })));
            }

            // Approval amount policy (2026-06-10 reversal of 272eaa2):
            //
            // DEFAULT = 'exact' (requiredAmount + 10% buffer). MAX_UINT256
            // is now opt-in via the per-row "Max approve" checkbox in
            // MultiTokenDepositModal.
            //
            // Why the reversal: the all-MAX policy from 272eaa2 was driven
            // by decimal-comma-typo fear (user types 100 instead of 1.00,
            // exact approve underflows the deposit). The amount input is
            // now normalized upstream (utils/normalizeAmount strips
            // thousands separators and treats lone EU commas as decimals
            // — see commit message for the locale-correctness reasoning),
            // so the typo-protection rationale doesn't hold. Meanwhile,
            // an unbounded allowance is a long-lived security footgun:
            // it persists forever, lets the vault contract (or any
            // upgrade target) move arbitrary balances at any time. The
            // +10% headroom on the exact path absorbs parse/round wobble
            // without leaving a permanent unlimited approval behind.
            const approvalAmount = deposit.approvalType === 'exact'
              ? requiredAmount + (requiredAmount / 10n)        // +10% buffer — the new default
              : 2n ** 256n - 1n;                                // MAX_UINT256 — opt-in

            // Approve token using writeContract
            const approvalHash = await writeContract(config, {
              address: tokenAddress as `0x${string}`,
              abi: [
                {
                  inputs: [
                    { name: 'spender', type: 'address' },
                    { name: 'amount', type: 'uint256' }
                  ],
                  name: 'approve',
                  outputs: [{ name: '', type: 'bool' }],
                  stateMutability: 'nonpayable',
                  type: 'function'
                }
              ],
              functionName: 'approve',
              args: [getActiveContractAddress(), approvalAmount],
            });

            console.log(`  ⏳ Waiting for approval confirmation...`);
            await waitForTransactionReceipt(config, { hash: approvalHash });
            console.log(`  ✅ ${tokenAddress} approval confirmed`);
            // Progress emit: this approve step is done
            if (_approveIdx < _ercNeedingApprove.length) {
              _progressSteps[_approveIdx] = {
                ..._progressSteps[_approveIdx],
                status: 'done',
                detail: `Approved — tx ${String(approvalHash).slice(0, 10)}…`,
              };
              onProgress?.(_progressSteps.map(s => ({ ...s })));
              _approveIdx++;
            }
          } else {
            console.log(`  ✅ ${tokenAddress} already approved`);
          }
        } catch (error: any) {
          // Progress emit: this approve step failed
          if (_approveIdx < _ercNeedingApprove.length) {
            _progressSteps[_approveIdx] = {
              ..._progressSteps[_approveIdx],
              status: 'failed',
              detail: error?.shortMessage || error?.message || 'Approve failed',
            };
            onProgress?.(_progressSteps.map(s => ({ ...s })));
          }
          // Handle user rejection gracefully
          if (error.message?.includes('User rejected') ||
              error.message?.includes('User denied') ||
              error.name === 'UserRejectedRequestError') {
            console.log(`  ⛔ User cancelled approval for ${tokenAddress}`);
            toast({
              title: "Approval Cancelled",
              description: `You cancelled the approval for ${tokenInfo?.symbol || tokenAddress}. You can try again.`,
              variant: "destructive",
            });
            // Don't throw error, just continue to next token or end gracefully
            return;
          }

          console.error(`  ❌ Error handling approval for ${tokenAddress}:`, error);
          toast({
            title: "Approval Failed",
            description: `Failed to approve ${tokenInfo?.symbol || tokenAddress}. Please try again.`,
            variant: "destructive",
          });
          throw new Error(`Failed to approve token ${tokenAddress}`);
        }
      }

      // Execute the transaction
      console.log('📤 Executing multi-token deposit...');
      console.log('Contract address:', getActiveContractAddress());
      console.log('Tokens:', tokens);
      console.log('Amounts:', amounts);
      console.log('Total ETH value to send:', formatEther(totalEthValue));
      console.log('Native included:', nativeSum > 0n);
      console.log('Token deposits count:', approvalTokenDeposits.length);

      // Tx lifecycle indices = the last three steps.
      const _signIdx    = _progressSteps.length - 3;
      const _confirmIdx = _progressSteps.length - 2;
      const _finalIdx   = _progressSteps.length - 1;
      const _setStep = (idx: number, status: _PSStatus, detail?: string) => {
        _progressSteps[idx] = { ..._progressSteps[idx], status, ...(detail !== undefined ? { detail } : {}) };
        onProgress?.(_progressSteps.map(s => ({ ...s })));
      };

      // `_phase` tracks the in-flight lifecycle step so the catch block
      // fails the right one (user rejection at sign vs on-chain revert).
      let _phase = _signIdx;
      try {
        _setStep(_signIdx, 'running', 'Open your wallet and sign the deposit…');

        // Async variant returns the tx hash while STILL feeding the
        // hook's data → useWaitForTransactionReceipt → isConfirmed
        // auto-refresh machinery (same mutation state).
        const txHash = await writeVaultContractAsync({
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'depositMultipleTokens',
          args: [tokens, amounts],
          chain: getTargetChain(),
          account: address,
          value: totalEthValue,
        });

        // Signed ≠ confirmed. The confirm step runs until the chain
        // mines the tx — exactly like the debug UI's `await tx.wait()`.
        _setStep(_signIdx, 'done', `Signed & broadcast — tx ${String(txHash).slice(0, 10)}…`);
        _phase = _confirmIdx;
        _setStep(_confirmIdx, 'running', 'Waiting for on-chain confirmation…');

        const receipt = await waitForTransactionReceipt(config, { hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error(`depositMultipleTokens reverted on-chain (block ${receipt.blockNumber})`);
        }
        _setStep(_confirmIdx, 'done', `Confirmed in block ${receipt.blockNumber}`);
        // See the single-asset notes — release isLoading at receipt
        // time so other actions aren't blocked during the 12s finality
        // wait that follows.
        setIsLoading(false);

        console.log('✅ Multi-token deposit confirmed on-chain');
        if (SHOW_LIFECYCLE_CONFIRMATION_TOASTS) {
          toast({
            title: "Multi-token deposit confirmed",
            description: `Deposited ${deposits.length} token${deposits.length === 1 ? '' : 's'} to vault`,
          });
        }

        // Finalize: RPCs need a moment before they serve the new state
        // (12s on ETH, less elsewhere — getChainFinalityDelay). This
        // info used to be a corner toast; it now lives in the popup.
        // The isConfirmed effect refreshes balances on the same delay.
        _phase = _finalIdx;
        const _finalityDelay = getChainFinalityDelay();
        _setStep(_finalIdx, 'running', `Waiting ${_finalityDelay / 1000}s for ${activeChain} chain finality, then updating balances…`);
        await new Promise(resolve => setTimeout(resolve, _finalityDelay));
        _setStep(_finalIdx, 'done', 'Balances updated ✓');
      } catch (e: any) {
        _setStep(_phase, 'failed', e?.shortMessage || e?.message || 'Deposit failed');
        throw e;
      }

    } catch (error: any) {

      // Handle specific errors
      if (error.message?.includes('RateLimitExceeded')) {
        toast({
          title: "Rate limit exceeded",
          description: "Too many transactions. Please wait before trying again.",
          variant: "destructive",
        });
      } else if (error.message?.includes('insufficient funds')) {
        toast({
          title: "Insufficient funds",
          description: "Not enough balance for deposit + fee",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Multi-token deposit failed",
          description: error.message || "Unknown error occurred",
          variant: "destructive",
        });
      }

      throw error;
    }
  };

  const depositTokenWithDelay = async (tokenAddress: string, amount: string, tokenSymbol: string) => {
    if (!address) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      
      // CRITICAL DEBUG: Log the exact amount at each step to find where scientific notation conversion happens
      console.log(`🔍 DEBUG - depositTokenWithDelay called with amount:`, {
        originalAmount: amount,
        amountType: typeof amount,
        hasScientificNotation: amount.includes('e') || amount.includes('E'),
        amountLength: amount.length
      });
      
      debugLog(`⏱️ Deposit with 3-second delay for ${amount} ${tokenSymbol}`);

      // Step 1: Get token decimals (like other functions)
      const decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": true,
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "type": "function"
          }
        ],
        functionName: 'decimals',
      }) as number;

      debugLog(`🔍 Token ${tokenSymbol} decimals:`, decimals);

      // Step 2: Convert amount using proper decimals - PRECISION SAFE
      const amountWei = convertToWei(amount, decimals);
      debugLog(`💰 Amount in wei:`, amountWei.toString());

      // ✅ NEW: WALLET BALANCE VALIDATION - Check if user has enough tokens BEFORE approval
      debugLog(`🔍 Checking wallet balance for ${tokenSymbol}...`);
      try {
        const walletTokenBalance = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: [
            {
              "constant": true,
              "inputs": [{"name": "_owner", "type": "address"}],
              "name": "balanceOf",
              "outputs": [{"name": "", "type": "uint256"}],
              "type": "function"
            }
          ],
          functionName: 'balanceOf',
          args: [address],
        }) as bigint;

        debugLog(`🔍 Wallet ${tokenSymbol} balance:`, walletTokenBalance.toString());
        debugLog(`🔍 Amount to deposit:`, amountWei.toString());

        if (walletTokenBalance < amountWei) {
          const available = formatTokenBalance(walletTokenBalance.toString(), decimals);
          toast({
            title: "Insufficient Token Balance",
            description: `You only have ${available} ${tokenSymbol}. Cannot deposit ${amount} ${tokenSymbol}.`,
            variant: "destructive",
          });
          setIsLoading(false);
          return; // ❌ Block transaction - user saves gas
        }

        debugLog(`✅ Sufficient ${tokenSymbol} balance confirmed`);
      } catch (balanceError) {
        debugError('❌ Failed to check wallet balance:', balanceError);
        toast({
          title: "Balance Check Failed",
          description: `Could not verify your ${tokenSymbol} balance. Please try again.`,
          variant: "destructive",
        });
        setIsLoading(false);
        return; // ❌ Block transaction - user saves gas
      }

      // ✅ NEW: PRE-SIMULATION - Check if transaction will succeed
      debugLog(`🔍 Pre-simulating token deposit transaction...`);
      try {
        const { request } = await publicClient.simulateContract({
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'depositToken',
          args: [tokenAddress, amountWei],
          account: address,
          value: currentFee as bigint,
        });
        debugLog(`✅ Pre-simulation successful - transaction will succeed`);
      } catch (simulationError) {
        debugError('❌ Pre-simulation failed:', simulationError);
        
        // Check if it's a balance/allowance issue
        if (simulationError instanceof Error) {
          if (simulationError.message.includes('insufficient') || simulationError.message.includes('balance')) {
            toast({
              title: "Insufficient Balance",
              description: `You don't have enough ${tokenSymbol} to deposit this amount.`,
              variant: "destructive",
            });
          } else if (simulationError.message.includes('allowance') || simulationError.message.includes('approve')) {
            toast({
              title: "Approval Required",
              description: `Please approve ${tokenSymbol} spending first.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Transaction Will Fail",
              description: `Pre-simulation failed: ${simulationError.message}`,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Transaction Will Fail",
            description: "Pre-simulation failed - transaction would not succeed",
            variant: "destructive",
          });
        }
        
        setIsLoading(false);
        return; // ❌ Block transaction - user saves gas
      }

      // Step 3: Send approval transaction with precision buffer
      // CRITICAL FIX: Approve slightly more to account for precision differences
      // This prevents the "leftover dust" issue where small amounts can't be deposited
      const approvalAmount = amountWei + (amountWei / 10000n); // Add 0.01% buffer
      debugLog(`🔐 Approval amount with buffer:`, approvalAmount.toString());
      
      await writeVaultContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": false,
            "inputs": [
              {"name": "spender", "type": "address"},
              {"name": "amount", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"name": "", "type": "bool"}],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [
          getActiveContractAddress() as `0x${string}`,
          approvalAmount // Use buffered amount for approval
        ],
        chain: getTargetChain(),
        account: address,
      });

      debugLog(`✅ Approval transaction sent, waiting 3 seconds...`);
      
      toast({
        title: "Token Approval Sent",
        description: `Approving ${amount} ${tokenSymbol} for vault...`,
      });

      // Step 4: Wait 3 seconds then send deposit
      setTimeout(async () => {
        try {
          debugLog(`⏰ 3 seconds elapsed, sending deposit transaction for ${tokenSymbol}...`);
          
          // Get current fee for the transaction
          if (!currentFee) {
            throw new Error('Current fee not available');
          }
          
          const feeWei = currentFee as bigint;
          debugLog(`💰 Current fee: ${feeWei} wei (${formatEther(feeWei)} ETH)`);
          
          // Send the deposit transaction
          await writeVaultContract({
            address: getActiveContractAddress() as `0x${string}`,
            abi: VAULT_ABI,
            functionName: 'depositToken',
            args: [tokenAddress, amountWei], // Use proper amount
            chain: getTargetChain(),
            account: address,
            value: feeWei, // Send ETH fee along with token deposit
          });
          
          debugLog(`📝 Deposit transaction sent with ETH fee`);
          
          toast({
            title: "Token Deposit Sent",
            description: `Depositing ${amount} ${tokenSymbol} + ${formatEther(feeWei)} ETH fee to vault...`,
          });
          
          // DON'T refresh here - let the transaction confirmation system handle it
          // DON'T set isLoading(false) here - let the transaction confirmation system handle it
          
        } catch (error) {
          debugError('❌ Deposit transaction error:', error);
          toast({
            title: "Deposit Failed",
            description: `Failed to deposit ${tokenSymbol}`,
            variant: "destructive",
          });
          setIsLoading(false);
        }
      }, 3000); // 3 seconds delay

      // DON'T set isLoading(false) here - let the delayed deposit handle it
      
    } catch (error) {
      debugError('❌ Approval transaction error:', error);
      toast({
        title: "Error",
        description: `Failed to approve ${tokenSymbol}`,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // Helper: Execute token deposit (when allowance is sufficient).
  // When onProgress is provided, runs the canonical 3-step lifecycle
  // (Sign → Confirm → Finalize) and waits for the receipt before
  // returning, matching the ETH-side hooks.
  const executeTokenDeposit = async (
    tokenAddress: string,
    amount: bigint,
    tokenSymbol: string,
    onProgress?: (steps: _PS[]) => void,
  ) => {
    try {
      debugLog(`🚀 Executing direct deposit for ${tokenSymbol}...`);

      // CRITICAL FIX: Always get fresh fee before transaction
      debugLog('💰 Getting fresh fee before token deposit...');
      const freshFee = await getCurrentFee();
      if (!freshFee) {
        throw new Error('Failed to get fresh fee');
      }

      setCurrentFee(freshFee);
      debugLog(`✅ Fresh fee obtained: ${formatEther(freshFee)} ETH`);

      const feeWei = freshFee;
      debugLog(`💰 Using fresh fee: ${feeWei} wei (${formatEther(feeWei)} ETH)`);

      const lc = buildTxLifecycle(onProgress);
      try {
        lc.set(0, 'running', `Open your wallet and sign depositToken(${tokenSymbol})…`);
        // @wagmi/core action — independent per call (no shared mutation).
        const txHash = await writeContract(config, {
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'depositToken',
          args: [tokenAddress, amount],
          value: feeWei,
        });
        lc.set(0, 'done', `Signed & broadcast — tx ${String(txHash).slice(0, 10)}…`);
        lc.advance(1);
        lc.set(1, 'running', 'Waiting for on-chain confirmation…');
        const receipt = await waitForTransactionReceipt(config, { hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error(`depositToken reverted on-chain (block ${receipt.blockNumber})`);
        }
        lc.set(1, 'done', `Confirmed in block ${receipt.blockNumber}`);
        // Release the app-wide isLoading flag as soon as the chain
        // says success — don't wait for the isConfirmed useEffect to
        // catch up (it can lag the explicit waitForTransactionReceipt
        // by hundreds of ms, leaving every per-token button on the
        // home page greyed out during the 12s finality wait).
        setIsLoading(false);

        if (SHOW_LIFECYCLE_CONFIRMATION_TOASTS) {
          toast({
            title: "Token Deposit Confirmed",
            description: `Deposited ${formatEther(amount)} ${tokenSymbol} to vault`,
          });
        }

        lc.advance(2);
        const finality = getChainFinalityDelay();
        lc.set(2, 'running', `Waiting ${finality / 1000}s for ${activeChain} chain finality, then updating balances…`);
        await new Promise(resolve => setTimeout(resolve, finality));
        // Single-asset hooks use @wagmi/core's writeContract action
        // (no shared mutation state), which means the legacy
        // isConfirmed useEffect that did these refetches doesn't fire
        // for our hash. Do them here so balances/fee/token-lists land.
        refreshAfterTx();
        lc.set(2, 'done', 'Balances updated ✓');
      } catch (innerError: any) {
        lc.set(lc.getPhase(), 'failed', innerError?.shortMessage || innerError?.message || 'Deposit failed');
        throw innerError;
      }

    } catch (error) {
      debugError('❌ Direct token deposit error:', error);
      toast({
        title: "Error",
        description: `Failed to deposit ${tokenSymbol}`,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // Helper: Execute approval then auto-deposit after confirmation
  const executeTokenApprovalAndDeposit = async (tokenAddress: string, amount: bigint, tokenSymbol: string) => {
    try {
      debugLog(`🔐 Executing approval + auto-deposit for ${tokenSymbol}...`);
      
      // Step 1: Send unlimited approval per the unified policy (2026-06-07).
      // We no longer try to approve "exact amount + buffer" — the decimal-comma
      // typo risk + the need to re-approve every deposit isn't worth the
      // theoretical safety improvement. User approves once per token; future
      // deposits skip the approval step entirely (currentAllowance >= amountWei).
      const approvalAmount = 2n ** 256n - 1n; // MAX_UINT256 — one-time, then never again
      debugLog(`🔐 Approval amount (max):`, approvalAmount.toString());
      
      await writeVaultContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": false,
            "inputs": [
              {"name": "spender", "type": "address"},
              {"name": "amount", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"name": "", "type": "bool"}],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [
          getActiveContractAddress() as `0x${string}`,
          approvalAmount // Use buffered amount for approval
        ],
        chain: getTargetChain(),
        account: address,
      });

      debugLog(`✅ Approval transaction sent`);
      
      toast({
        title: "Token Approval Sent",
        description: `Approving ${formatEther(amount)} ${tokenSymbol} for vault...`,
      });

      // Step 2: Wait for approval confirmation
      debugLog(`⏳ Waiting for approval confirmation...`);
      
      // Use the transaction confirmation system to auto-trigger deposit
      // We'll set a flag to indicate this is an approval transaction
      // The hash will be available in the hook state after the transaction is sent
      setPendingApprovalForDeposit({
        tokenAddress,
        amount,
        tokenSymbol,
        approvalHash: '' // Will be set when transaction is sent
      });

      // DON'T set isLoading(false) here - let the approval confirmation trigger deposit
      
    } catch (error) {
      debugError('❌ Token approval error:', error);
      toast({
        title: "Error",
        description: `Failed to approve ${tokenSymbol}`,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // Token withdrawal function with approval
  const withdrawTokenWagmi = async (
    tokenAddress: string,
    amount: string,
    tokenSymbol: string,
    onProgress?: (steps: _PS[]) => void,
  ) => {
    if (!address) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      debugLog(`💰 Withdrawing ${amount} ${tokenSymbol} from vault`);

      // Step 1: Get token decimals (like transferInternalToken)
      const decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": true,
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "type": "function"
          }
        ],
        functionName: 'decimals',
      }) as number;

      debugLog(`🔍 Token ${tokenSymbol} decimals:`, decimals);

      // Step 2: Convert amount using proper decimals - PRECISION SAFE
      const amountWei = convertToWei(amount, decimals);
      debugLog(`💰 Amount in wei:`, amountWei.toString());
      
      // Get current fee for the transaction
      if (!currentFee) {
        throw new Error('Current fee not available');
      }
      
      const feeWei = currentFee as bigint;
      debugLog(`💰 Current fee: ${feeWei} wei (${formatEther(feeWei)} ETH)`);

      // Check if user has enough ETH for fee
      if (walletBalance && walletBalance.value < feeWei) {
        const feeRequired = formatEther(feeWei);
        const available = formatEther(walletBalance.value);
        debugLog('❌ Insufficient wallet balance for withdrawal fee:', { feeRequired, available });
        toast({
          title: "Insufficient Balance for Fee",
          description: `You need ${feeRequired} ETH for the withdrawal fee. You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // ✅ NEW: PRE-SIMULATION - Check if withdrawal will succeed
      debugLog(`🔍 Pre-simulating token withdrawal transaction...`);
      try {
        const { request } = await publicClient.simulateContract({
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'withdrawToken',
          args: [tokenAddress, amountWei],
          account: address,
          value: feeWei,
        });
        debugLog(`✅ Pre-simulation successful - withdrawal will succeed`);
      } catch (simulationError) {
        debugError('❌ Pre-simulation failed:', simulationError);
        
        // Check if it's a vault balance issue
        if (simulationError instanceof Error) {
          if (simulationError.message.includes('insufficient') || simulationError.message.includes('balance')) {
            toast({
              title: "Insufficient Vault Balance",
              description: `You don't have enough ${tokenSymbol} in the vault to withdraw this amount.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Withdrawal Will Fail",
              description: `Pre-simulation failed: ${simulationError.message}`,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Withdrawal Will Fail",
            description: "Pre-simulation failed - withdrawal would not succeed",
            variant: "destructive",
          });
        }
        
        setIsLoading(false);
        return; // ❌ Block transaction - user saves gas
      }

      // 3-step lifecycle, same shape as the ETH-side hooks.
      const lc = buildTxLifecycle(onProgress);
      try {
        lc.set(0, 'running', `Open your wallet and sign withdrawToken(${tokenSymbol}, ${amount})…`);
        // @wagmi/core action — independent per call (no shared mutation).
        const txHash = await writeContract(config, {
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'withdrawToken',
          args: [tokenAddress, amountWei],
          value: feeWei,
        });
        lc.set(0, 'done', `Signed & broadcast — tx ${String(txHash).slice(0, 10)}…`);
        lc.advance(1);
        lc.set(1, 'running', 'Waiting for on-chain confirmation…');
        const receipt = await waitForTransactionReceipt(config, { hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error(`withdrawToken reverted on-chain (block ${receipt.blockNumber})`);
        }
        lc.set(1, 'done', `Confirmed in block ${receipt.blockNumber}`);
        // Release the app-wide isLoading flag as soon as the chain
        // says success — don't wait for the isConfirmed useEffect to
        // catch up (it can lag the explicit waitForTransactionReceipt
        // by hundreds of ms, leaving every per-token button on the
        // home page greyed out during the 12s finality wait).
        setIsLoading(false);

        if (SHOW_LIFECYCLE_CONFIRMATION_TOASTS) {
          toast({
            title: "Token Withdrawal Confirmed",
            description: `Withdrew ${amount} ${tokenSymbol} from vault`,
          });
        }

        lc.advance(2);
        const finality = getChainFinalityDelay();
        lc.set(2, 'running', `Waiting ${finality / 1000}s for ${activeChain} chain finality, then updating balances…`);
        await new Promise(resolve => setTimeout(resolve, finality));
        // Single-asset hooks use @wagmi/core's writeContract action
        // (no shared mutation state), which means the legacy
        // isConfirmed useEffect that did these refetches doesn't fire
        // for our hash. Do them here so balances/fee/token-lists land.
        refreshAfterTx();
        lc.set(2, 'done', 'Balances updated ✓');
      } catch (innerError: any) {
        lc.set(lc.getPhase(), 'failed', innerError?.shortMessage || innerError?.message || 'Withdrawal failed');
        throw innerError;
      }

    } catch (error) {
      debugError('❌ Token withdrawal error:', error);
      toast({
        title: "Error",
        description: `Failed to withdraw ${tokenSymbol}`,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const withdrawMultipleTokensWagmi = async (
    withdrawals: { token: string; amount: string }[],
    onProgress?: (steps: _PS[]) => void,
  ) => {
    console.log('withdrawMultipleTokens called with:', withdrawals);
    console.log('Address:', address);
    console.log('Is connected:', isConnected);

    // THREE honest lifecycle steps (mirrors debug UI b8-7): sign →
    // confirm → finalize. Withdraw is one tx — no approvals needed for
    // tokens already in the vault. Helpers are no-ops when the caller
    // didn't pass onProgress. _wPhase tracks the in-flight step so the
    // catch handler fails the right one.
    const _wSteps: _PS[] = [
      { label: 'Sign in wallet', status: 'pending' },
      { label: 'Confirm on-chain', status: 'pending' },
      { label: 'Finalize & refresh', status: 'pending' },
    ];
    let _wPhase = 0;
    const _wEmit = () => onProgress?.(_wSteps.map(s => ({ ...s })));
    const _wSet = (idx: number, status: _PSStatus, detail?: string) => {
      _wSteps[idx] = { ..._wSteps[idx], status, ...(detail !== undefined ? { detail } : {}) };
      _wEmit();
    };

    if (!address || !isConnected) {
      console.log('Wallet not connected - returning early');
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to withdraw tokens",
        variant: "destructive",
      });
      return;
    }

    console.log('Checking withdrawals length:', withdrawals.length);
    if (withdrawals.length === 0) {
      console.log('No withdrawals specified');
      toast({
        title: "No withdrawals specified",
        description: "Please select at least one token to withdraw",
        variant: "destructive",
      });
      return;
    }

    if (withdrawals.length > 25) {
      console.log('Too many tokens:', withdrawals.length);
      toast({
        title: "Too many tokens",
        description: "Maximum 25 tokens per transaction",
        variant: "destructive",
      });
      return;
    }

    // Validation passed — open the progress modal in the parent UI.
    _wSet(0, 'running', `Preparing withdrawal of ${withdrawals.length} token${withdrawals.length === 1 ? '' : 's'}…`);

    try {
      // ONE atomic call (2026-06-10): Bank8's withdrawMultipleTokens
      // handles mixed native + ERC-20 batches since the 2026-05-31
      // mixed-batch contract fix — native rides in the arrays as
      // address(0). The old frontend-side ETH-split (separate
      // withdrawETH txs first) predates that fix; it also broke mixed
      // withdraws outright because native isn't in vaultTokens and the
      // ERC-20 validation loop rejected it. Mirrors debug UI b8-7.
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
      const tokens: string[] = [];
      const amounts: string[] = [];

      for (const withdrawal of withdrawals) {
        const tokenAddress = typeof withdrawal.token === 'string' ? withdrawal.token : withdrawal.token.address;
        if (tokenAddress === ZERO_ADDRESS) {
          // Native — always 18 decimals on our chains. Vault balance for
          // native is validated by the picker UI (it shows the live
          // vaulted balance); the pre-flight below catches any race.
          tokens.push(ZERO_ADDRESS);
          amounts.push(parseEther(withdrawal.amount).toString());
        } else {
          const tokenInfo = vaultTokens.find(t => t.address === tokenAddress);
          if (!tokenInfo) {
            toast({
              title: "Token not found in vault",
              description: `Token ${tokenAddress} is not available in your vault`,
              variant: "destructive",
            });
            return;
          }
          if (parseFloat(withdrawal.amount) > parseFloat(tokenInfo.balance)) {
            toast({
              title: "Insufficient vault balance",
              description: `You only have ${tokenInfo.balance} ${tokenInfo.symbol} in your vault`,
              variant: "destructive",
            });
            return;
          }
          tokens.push(tokenAddress);
          amounts.push(convertToWei(withdrawal.amount, tokenInfo.decimals || 18).toString());
        }
      }

      console.log(`🔍 Atomic withdraw batch: ${tokens.length} entries`);

      // Get fee for the transaction
      const feeInWei = currentFee ? (currentFee as bigint) : 0n;
      console.log('💸 Current fee available:', !!currentFee);
      console.log('💸 Current fee value:', feeInWei.toString());
      console.log('💸 Current fee formatted:', formatEther(feeInWei));

      // Validate fee is reasonable (not 0 and not too high)
      if (feeInWei === 0n) {
        console.log('⚠️ WARNING: Fee is 0 - this might cause "insufficient fee" error');
      }

      // For multi-token withdrawals, send the fee amount
      console.log('💵 Fee to send for multi-withdrawal:', formatEther(feeInWei));

      // Safety check: ensure we have a valid fee
      if (feeInWei === 0n) {
        console.log('🚨 CRITICAL: Fee is 0, trying alternative approach');
        // Try with a minimum fee of 0.001 ETH as fallback
        const minimumFee = parseEther('0.001');
        console.log('🔄 Using minimum fallback fee:', formatEther(minimumFee));
        // We'll proceed with the minimum fee
      }

      // Validate that user has enough ETH for the fee
      if (walletBalance && walletBalance.value < feeInWei) {
        const feeRequired = formatEther(feeInWei);
        const available = formatEther(walletBalance.value);
        debugLog('❌ Insufficient wallet balance for withdrawal fee:', { feeRequired, available });
        toast({
          title: "Insufficient Balance for Fee",
          description: `You need ${feeRequired} ETH for the withdrawal fee. You have ${available} ETH.`,
          variant: "destructive",
        });
        return;
      }

      _wSet(0, 'running', 'Open your wallet and sign the withdraw…');

      // Async variant returns the hash while still feeding the hook's
      // auto-refresh machinery. Signed ≠ confirmed: the confirm step
      // runs until the receipt lands (debug UI's `await tx.wait()`).
      const txHash = await writeVaultContractAsync({
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'withdrawMultipleTokens',
        args: [tokens, amounts],
        chain: getTargetChain(),
        account: address,
        value: feeInWei,
      });

      _wSet(0, 'done', `Signed & broadcast — tx ${String(txHash).slice(0, 10)}…`);
      _wPhase = 1;
      _wSet(1, 'running', 'Waiting for on-chain confirmation…');
      const receipt = await waitForTransactionReceipt(config, { hash: txHash });
      if (receipt.status !== 'success') {
        throw new Error(`withdrawMultipleTokens reverted on-chain (block ${receipt.blockNumber})`);
      }

      console.log('✅ Multi-token withdrawal confirmed on-chain');
      _wSet(1, 'done', `Confirmed in block ${receipt.blockNumber}`);
      setIsLoading(false);  // same fix as the other lifecycle helpers

      if (SHOW_LIFECYCLE_CONFIRMATION_TOASTS) {
        toast({
          title: "Multi-token withdrawal confirmed",
          description: `Withdrew ${withdrawals.length} token${withdrawals.length === 1 ? '' : 's'} from vault`,
        });
      }

      // Finalize: RPCs need a moment before they serve the new state.
      // This info used to be a corner toast; it now lives in the popup.
      _wPhase = 2;
      const _wFinality = getChainFinalityDelay();
      _wSet(2, 'running', `Waiting ${_wFinality / 1000}s for ${activeChain} chain finality, then updating balances…`);
      await new Promise(resolve => setTimeout(resolve, _wFinality));
      _wSet(2, 'done', 'Balances updated ✓');

    } catch (error: any) {
      _wSet(_wPhase, 'failed', error.message || 'Unknown error occurred');
      // Handle specific errors
      if (error.message?.includes('RateLimitExceeded')) {
        toast({
          title: "Rate limit exceeded",
          description: "Too many transactions. Please wait before trying again.",
          variant: "destructive",
        });
      } else if (error.message?.includes('insufficient funds')) {
        toast({
          title: "Insufficient funds",
          description: "Not enough balance for withdrawal + fee",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Multi-token withdrawal failed",
          description: error.message || "Unknown error occurred",
          variant: "destructive",
        });
      }

      throw error;
    }
  };

  const transferMultipleTokensWagmi = async (
    transfers: { token: string; amount: string }[],
    to: string,
    onProgress?: (steps: _PS[]) => void,
  ) => {
    console.log('transferMultipleTokens called with:', transfers, 'to:', to);
    console.log('Address:', address);
    console.log('Is connected:', isConnected);

    // THREE honest lifecycle steps (mirrors debug UI b8-11): sign →
    // confirm → finalize. One tx — no approvals for vaulted tokens.
    // Helpers are no-ops when the caller didn't pass onProgress.
    // _tPhase tracks the in-flight step for the catch handler.
    const _tSteps: _PS[] = [
      { label: 'Sign in wallet', status: 'pending' },
      { label: 'Confirm on-chain', status: 'pending' },
      { label: 'Finalize & refresh', status: 'pending' },
    ];
    let _tPhase = 0;
    const _tEmit = () => onProgress?.(_tSteps.map(s => ({ ...s })));
    const _tSet = (idx: number, status: _PSStatus, detail?: string) => {
      _tSteps[idx] = { ..._tSteps[idx], status, ...(detail !== undefined ? { detail } : {}) };
      _tEmit();
    };

    if (!address || !isConnected) {
      console.log('Wallet not connected - returning early');
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to transfer tokens",
        variant: "destructive",
      });
      return;
    }

    if (!to || to.trim() === "") {
      toast({
        title: "Invalid recipient",
        description: "Please provide a valid recipient address",
        variant: "destructive",
      });
      return;
    }

    console.log('Checking transfers length:', transfers.length);
    if (transfers.length === 0) {
      console.log('No transfers specified');
      toast({
        title: "No transfers specified",
        description: "Please select at least one token to transfer",
        variant: "destructive",
      });
      return;
    }

    if (transfers.length > 25) {
      console.log('Too many tokens:', transfers.length);
      toast({
        title: "Too many tokens",
        description: "Maximum 25 tokens per transaction",
        variant: "destructive",
      });
      return;
    }

    try {
      // Validate recipient address format
      if (!to.match(/^0x[a-fA-F0-9]{40}$/)) {
        toast({
          title: "Invalid recipient address",
          description: "Please provide a valid Ethereum address",
          variant: "destructive",
        });
        return;
      }

      // Validation passed — open the progress modal in the parent UI.
      _tSet(0, 'running', `Preparing transfer of ${transfers.length} token${transfers.length === 1 ? '' : 's'} to ${to.slice(0, 6)}…${to.slice(-4)}…`);

      // ONE atomic call (2026-06-10): Bank8's transferMultipleTokensInternal
      // handles mixed native + ERC-20 batches since the 2026-05-31
      // mixed-batch contract fix — native rides in the arrays as
      // address(0). The old frontend-side ETH-split (separate transferETH
      // txs first) predates that fix and broke mixed transfers because
      // native isn't in vaultTokens. Mirrors debug UI b8-11.
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
      const tokens: string[] = [];
      const amounts: string[] = [];

      for (const transfer of transfers) {
        const tokenAddress = typeof transfer.token === 'string' ? transfer.token : transfer.token.address;
        if (tokenAddress === ZERO_ADDRESS) {
          // Native — always 18 decimals on our chains. Balance is
          // validated by the picker UI; pre-flight catches any race.
          tokens.push(ZERO_ADDRESS);
          amounts.push(parseEther(transfer.amount).toString());
        } else {
          const tokenInfo = vaultTokens.find(t => t.address === tokenAddress);
          if (!tokenInfo) {
            toast({
              title: "Token not found in vault",
              description: `Token ${tokenAddress} is not available in your vault`,
              variant: "destructive",
            });
            return;
          }
          if (parseFloat(transfer.amount) > parseFloat(tokenInfo.balance)) {
            toast({
              title: "Insufficient vault balance",
              description: `You only have ${tokenInfo.balance} ${tokenInfo.symbol} in your vault`,
              variant: "destructive",
            });
            return;
          }
          tokens.push(tokenAddress);
          amounts.push(convertToWei(transfer.amount, tokenInfo.decimals || 18).toString());
        }
      }

      console.log(`🔍 Atomic transfer batch: ${tokens.length} entries → ${to}`);

      // Get fee for the transaction
      const feeInWei = currentFee ? (currentFee as bigint) : 0n;
      console.log('💸 Current fee available:', !!currentFee);
      console.log('💸 Current fee value:', feeInWei.toString());
      console.log('💸 Current fee formatted:', formatEther(feeInWei));

      // Validate fee is reasonable
      if (feeInWei === 0n) {
        console.log('⚠️ WARNING: Fee is 0 - this might cause "insufficient fee" error');
      }

      // Validate that user has enough ETH for the fee
      if (walletBalance && walletBalance.value < feeInWei) {
        const feeRequired = formatEther(feeInWei);
        const available = formatEther(walletBalance.value);
        debugLog('❌ Insufficient wallet balance for transfer fee:', { feeRequired, available });
        toast({
          title: "Insufficient Balance for Fee",
          description: `You need ${feeRequired} ETH for the transfer fee. You have ${available} ETH.`,
          variant: "destructive",
        });
        return;
      }

      _tSet(0, 'running', 'Open your wallet and sign the transfer…');

      // Async variant returns the hash while still feeding the hook's
      // auto-refresh machinery. Signed ≠ confirmed: the confirm step
      // runs until the receipt lands (debug UI's `await tx.wait()`).
      const txHash = await writeVaultContractAsync({
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'transferMultipleTokensInternal',
        args: [tokens, to, amounts],
        chain: getTargetChain(),
        account: address,
        value: feeInWei,
      });

      _tSet(0, 'done', `Signed & broadcast — tx ${String(txHash).slice(0, 10)}…`);
      _tPhase = 1;
      _tSet(1, 'running', 'Waiting for on-chain confirmation…');
      const receipt = await waitForTransactionReceipt(config, { hash: txHash });
      if (receipt.status !== 'success') {
        throw new Error(`transferMultipleTokensInternal reverted on-chain (block ${receipt.blockNumber})`);
      }

      console.log('✅ Multi-token transfer confirmed on-chain');
      _tSet(1, 'done', `Confirmed in block ${receipt.blockNumber}`);
      setIsLoading(false);  // same fix as the other lifecycle helpers

      if (SHOW_LIFECYCLE_CONFIRMATION_TOASTS) {
        toast({
          title: "Multi-token transfer confirmed",
          description: `Transferred ${transfers.length} token${transfers.length === 1 ? '' : 's'} to ${to.slice(0, 6)}...${to.slice(-4)}`,
        });
      }

      // Finalize: RPCs need a moment before they serve the new state.
      // This info used to be a corner toast; it now lives in the popup.
      _tPhase = 2;
      const _tFinality = getChainFinalityDelay();
      _tSet(2, 'running', `Waiting ${_tFinality / 1000}s for ${activeChain} chain finality, then updating balances…`);
      await new Promise(resolve => setTimeout(resolve, _tFinality));
      _tSet(2, 'done', 'Balances updated ✓');

    } catch (error: any) {
      _tSet(_tPhase, 'failed', error.message || 'Unknown error occurred');
      // Handle specific errors
      if (error.message?.includes('RateLimitExceeded')) {
        toast({
          title: "Rate limit exceeded",
          description: "Too many transactions. Please wait before trying again.",
          variant: "destructive",
        });
      } else if (error.message?.includes('insufficient funds')) {
        toast({
          title: "Insufficient funds",
          description: "Not enough balance for transfer + fee",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Multi-token transfer failed",
          description: error.message || "Unknown error occurred",
          variant: "destructive",
        });
      }

      throw error;
    }
  };

  // Token Transfer Function
  const transferInternalTokenWagmi = async (
    tokenAddress: string,
    to: string,
    amount: string,
    tokenSymbol: string,
    onProgress?: (steps: _PS[]) => void,
  ) => {
    if (!address) {
      toast({
        title: "Error",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      debugLog(`🔄 Transferring ${amount} ${tokenSymbol} to ${to}`);

      // Step 1: Get token decimals (like your working project)
      const decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": true,
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "type": "function"
          }
        ],
        functionName: 'decimals',
      }) as number;

      debugLog(`🔍 Token ${tokenSymbol} decimals:`, decimals);

      // Step 2: Convert amount using proper decimals - PRECISION SAFE
      const amountWei = convertToWei(amount, decimals);
      debugLog(`💰 Amount in wei:`, amountWei.toString());
      
      // Step 3: Get current fee
      if (!currentFee) {
        throw new Error('Current fee not available');
      }
      
      const feeWei = currentFee as bigint;
      debugLog(`💰 Current fee: ${feeWei} wei (${formatEther(feeWei)} ETH)`);

      // Step 4: Check wallet ETH balance for fee
      if (walletBalance && walletBalance.value < feeWei) {
        const feeRequired = formatEther(feeWei);
        const available = formatEther(walletBalance.value);
        debugLog('❌ Insufficient wallet balance for transfer fee:', { feeRequired, available });
        toast({
          title: "Insufficient Balance for Fee",
          description: `You need ${feeRequired} ETH for the transfer fee. You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // ✅ NEW: PRE-SIMULATION - Check if transfer will succeed
      debugLog(`🔍 Pre-simulating token transfer transaction...`);
      try {
        const { request } = await publicClient.simulateContract({
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'transferInternalToken',
          args: [tokenAddress, to, amountWei],
          account: address,
          value: feeWei,
        });
        debugLog(`✅ Pre-simulation successful - transfer will succeed`);
      } catch (simulationError) {
        debugError('❌ Pre-simulation failed:', simulationError);
        
        // Check if it's a vault balance issue
        if (simulationError instanceof Error) {
          if (simulationError.message.includes('insufficient') || simulationError.message.includes('balance')) {
            toast({
              title: "Insufficient Vault Balance",
              description: `You don't have enough ${tokenSymbol} in the vault to transfer this amount.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Transfer Will Fail",
              description: `Pre-simulation failed: ${simulationError.message}`,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Transfer Will Fail",
            description: "Pre-simulation failed - transfer would not succeed",
            variant: "destructive",
          });
        }
        
        setIsLoading(false);
        return; // ❌ Block transaction - user saves gas
      }

      // Step 5: Execute token transfer (like your working project)
      debugLog(`🚀 Calling transferInternalToken with:`, {
        tokenAddress,
        to,
        amountWei: amountWei.toString(),
        feeWei: feeWei.toString()
      });

      const lc = buildTxLifecycle(onProgress);
      try {
        lc.set(0, 'running', `Open your wallet and sign transferInternalToken(${tokenSymbol}, ${amount} → ${to.slice(0, 6)}…${to.slice(-4)})…`);
        // @wagmi/core action — independent per call (no shared mutation).
        const txHash = await writeContract(config, {
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'transferInternalToken',
          args: [tokenAddress, to, amountWei],
          value: feeWei,
        });
        lc.set(0, 'done', `Signed & broadcast — tx ${String(txHash).slice(0, 10)}…`);
        lc.advance(1);
        lc.set(1, 'running', 'Waiting for on-chain confirmation…');
        const receipt = await waitForTransactionReceipt(config, { hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error(`transferInternalToken reverted on-chain (block ${receipt.blockNumber})`);
        }
        lc.set(1, 'done', `Confirmed in block ${receipt.blockNumber}`);
        // Release the app-wide isLoading flag as soon as the chain
        // says success — don't wait for the isConfirmed useEffect to
        // catch up (it can lag the explicit waitForTransactionReceipt
        // by hundreds of ms, leaving every per-token button on the
        // home page greyed out during the 12s finality wait).
        setIsLoading(false);

        if (SHOW_LIFECYCLE_CONFIRMATION_TOASTS) {
          toast({
            title: "Token Transfer Confirmed",
            description: `Transferred ${amount} ${tokenSymbol} to ${to.slice(0, 6)}...${to.slice(-4)}`,
          });
        }

        lc.advance(2);
        const finality = getChainFinalityDelay();
        lc.set(2, 'running', `Waiting ${finality / 1000}s for ${activeChain} chain finality, then updating balances…`);
        await new Promise(resolve => setTimeout(resolve, finality));
        // Single-asset hooks use @wagmi/core's writeContract action
        // (no shared mutation state), which means the legacy
        // isConfirmed useEffect that did these refetches doesn't fire
        // for our hash. Do them here so balances/fee/token-lists land.
        refreshAfterTx();
        lc.set(2, 'done', 'Balances updated ✓');
      } catch (innerError: any) {
        lc.set(lc.getPhase(), 'failed', innerError?.shortMessage || innerError?.message || 'Transfer failed');
        throw innerError;
      }

    } catch (error) {
      debugError('❌ Token transfer error:', error);
      toast({
        title: "Transfer Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // Helper function to get chain-specific delay for blockchain finality
  // All chains benefit from delays to ensure proper state propagation
  const getChainFinalityDelay = useCallback(() => {
    switch (activeChain) {
      case 'ETH':
        return 12000; // 12 seconds delay for ETH (proper state propagation)
      case 'BSC':
        return 8000;  // 8 seconds delay for BSC (proper state propagation)
      case 'BASE':
        return 2000;  // 2 seconds delay for BASE (fast finality causes race conditions)
      default:
        return 5000;  // 5 seconds default delay for unknown chains
    }
  }, [activeChain]);

  // CRITICAL FIX: Reset refresh flag when new transaction starts (hash changes)
  React.useEffect(() => {
    if (hash) {
      // New transaction started, reset the refresh flag
      // This ensures each new transaction can trigger the refresh logic
      setHasRefreshedAfterConfirmation(false);
      if (process.env.NODE_ENV === 'development') {
        debugLog(`🔄 New transaction started (hash: ${hash}), resetting refresh flag`);
      }
    }
  }, [hash]);

  // Handle transaction state changes
  React.useEffect(() => {
    if (isConfirmed && !hasRefreshedAfterConfirmation) {
      debugLog('🔄 Transaction confirmed! Starting smart refetch...');

      // Set flag to prevent multiple refreshes for THIS transaction
      setHasRefreshedAfterConfirmation(true);

      // 2026-06-10: HIDDEN, not removed. This generic on-confirmation
      // toast fires for EVERY confirmed tx (single-asset deposits,
      // multi-token batches, approvals, etc). For multi-token flows it
      // duplicated the on-chain confirmation already shown in the
      // ProgressFlow popup's "Confirm on-chain" step, which is what
      // the user pointed out. Flipping SHOW_CONFIRMATION_TOAST to true
      // restores the corner notification (the single-asset paths still
      // have their own toasts elsewhere — see depositETHWagmi etc. —
      // so removing this one doesn't leave them silent).
      const SHOW_CONFIRMATION_TOAST = false;
      if (SHOW_CONFIRMATION_TOAST) {
        toast({
          title: "Transaction Confirmed!",
          description: "Your transaction has been confirmed on the blockchain",
        });
      }
      setIsLoading(false);
      
      // Check if this was an approval transaction that should trigger auto-deposit
      if (pendingApprovalForDeposit) {
        if (process.env.NODE_ENV === 'development') {
          debugLog('🔐 Approval confirmed, automatically proceeding to deposit...');
        }
        
        // Auto-execute the deposit
        executeTokenDeposit(
          pendingApprovalForDeposit.tokenAddress,
          pendingApprovalForDeposit.amount,
          pendingApprovalForDeposit.tokenSymbol
        );
        
        // Clear the pending approval
        setPendingApprovalForDeposit(null);
        
        toast({
          title: "Approval Confirmed!",
          description: `Automatically proceeding to deposit ${pendingApprovalForDeposit.tokenSymbol}...`,
        });
      }
      
      // CRITICAL FIX: Add chain-specific delay for blockchain finality
      // All chains benefit from delays to ensure proper state propagation
      const finalityDelay = getChainFinalityDelay();
      if (process.env.NODE_ENV === 'development') {
        debugLog(`⏰ Waiting ${finalityDelay}ms for ${activeChain} chain finality before refreshing data...`);
      }
      
      // 2026-06-10: HIDDEN, not removed — the finality-wait info now
      // lives in the ProgressFlow popup's "Finalize & refresh" step for
      // multi-token flows. Flip the flag to bring the corner toast back
      // (e.g. if single-asset flows need it again).
      const SHOW_FINALITY_TOAST = false;
      if (SHOW_FINALITY_TOAST) {
        toast({
          title: "Transaction Confirmed!",
          description: `Waiting ${finalityDelay/1000} seconds for ${activeChain} chain finality, then updating balances...`,
          variant: "default",
        });
      }
      
      // Delay the refresh to allow blockchain state to settle (or refresh immediately if no delay)
      const executeRefresh = () => {
        if (process.env.NODE_ENV === 'development') {
          debugLog(`✅ ${activeChain} chain finality delay completed (${finalityDelay}ms), now refreshing data...`);
        }
        
        // Smart refetch ONLY after transaction confirmation and finality delay
        // This updates balances without constant API polling
        if (process.env.NODE_ENV === 'development') {
          debugLog('📊 Refetching vault balance...');
      }
      refetchVaultBalance();
        
        if (process.env.NODE_ENV === 'development') {
          debugLog('💰 Refetching wallet balance...');
        }
      refetchWalletBalance();
        
        if (process.env.NODE_ENV === 'development') {
          debugLog('💸 Refetching current fee...');
        }
      refetchFee();
        
        // NEW: Refresh token balances after transaction confirmation and finality delay
        if (process.env.NODE_ENV === 'development') {
          debugLog('🪙 Refreshing token balances after confirmation...');
          debugLog('🪙 Calling fetchWalletTokens...');
        }
      fetchWalletTokens();
        if (process.env.NODE_ENV === 'development') {
          debugLog('🪙 Calling fetchVaultTokensSigned...');
        }
      fetchVaultTokensSigned();
        if (process.env.NODE_ENV === 'development') {
          debugLog('🪙 Token refresh calls completed');
        }
        
        if (process.env.NODE_ENV === 'development') {
          debugLog(`✅ Smart refetch completed for ${activeChain} chain!`);
        }
      };

      if (finalityDelay > 0) {
        setTimeout(executeRefresh, finalityDelay);
      } else {
        executeRefresh();
      }
    }
  }, [isConfirmed, hasRefreshedAfterConfirmation, toast, refetchVaultBalance, refetchWalletBalance, refetchFee, fetchWalletTokens, fetchVaultTokensSigned, pendingApprovalForDeposit, hash, activeChain, getChainFinalityDelay]);

  // FIX: Reset loading state when transaction is cancelled or fails
  React.useEffect(() => {
    if (!isWritePendingForCurrentChain && isLoading) {
      if (process.env.NODE_ENV === 'development') {
        debugLog('🔄 Transaction cancelled or failed, resetting loading state');
      }
      setIsLoading(false);
    }
  }, [isWritePendingForCurrentChain, isLoading, setIsLoading]);

  // Reset refresh flag when new transaction starts
  React.useEffect(() => {
    if (isWritePendingForCurrentChain) {
      if (process.env.NODE_ENV === 'development') {
        debugLog(`🔄 New transaction started for ${activeChain}, resetting refresh flag`);
      }
      setHasRefreshedAfterConfirmation(false);
    }
  }, [isWritePendingForCurrentChain, activeChain, setHasRefreshedAfterConfirmation]);

  // Auto-fetch chain-specific data when activeChain changes
  React.useEffect(() => {
    if (isConnected && address) {
      
      
      // Force refresh all Wagmi hooks by updating their dependencies
      const chainConfig = getCurrentChainConfig();
      
      // This will trigger re-fetching of all chain-specific data
      fetchChainSpecificData();
    }
  }, [activeChain, isConnected, address]);

  // Combined loading state - ONLY for current chain's transactions
  // Drop the wagmi-derived `isConfirmingForCurrentChain` once isConfirmed
  // flips true (2026-06-10): the hook's `isConfirming → false` transition
  // lags our explicit waitForTransactionReceipt by ~hundreds of ms to a
  // few seconds. With the lifecycle helpers now calling setIsLoading(false)
  // immediately after the receipt (11a8218), keeping isConfirming in the
  // formula re-blocks the UI for that lag window — user reported the
  // home-page per-token buttons and the cross-modal submit (e.g. start
  // a USD1 deposit while a WLFI withdraw is still in its finality wait)
  // were stuck during that period even though our own lifecycle had
  // already declared "Confirmed on-chain ✓".
  //
  // Including `&& !isConfirmed` makes wagmi's "currently confirming"
  // signal stop counting the moment the same hook also reports the
  // receipt landed — closes the lag window without removing the lock
  // for legacy code paths that never set isLoading and rely on the
  // wagmi state machine for blocking (they still get
  // isConfirmingForCurrentChain=true → blocked while genuinely
  // confirming; once isConfirmed flips, the lock releases at the same
  // instant our explicit await returns).
  const isTransactionLoading = isLoading || isWritePendingForCurrentChain || (isConfirmingForCurrentChain && !isConfirmed);

  // Check if we're on the correct network
  const isOnCorrectNetwork = chainId === getTargetChain().id;
  
  // Fetch chain-specific data when activeChain changes
  const fetchChainSpecificData = useCallback(() => {
    debugLog(`🔄 Fetching chain-specific data for ${activeChain}`);
    
    // Use debounced fetch for vault tokens to prevent race conditions
      debouncedFetchVaultTokens();
    
    // Other data can be fetched immediately
      refetchWalletBalance();
      refetchVaultBalance();
      refetchFee();
      fetchWalletTokens();
  }, [activeChain, debouncedFetchVaultTokens, refetchWalletBalance, refetchVaultBalance, refetchFee, fetchWalletTokens]);
  
  // Function to force network switch with user notification
  const forceNetworkSwitch = async () => {
    if (isOnCorrectNetwork) {
      debugLog('✅ Already on correct network');
      return;
    }
    
    debugLog('🚨 Forcing network switch - user must switch to continue');
    
    toast({
      title: "Network Switch Required",
      description: `Please switch to ${getTargetChain().name} to use this app`,
      variant: "destructive",
    });
    
    // Try to switch automatically
    await autoSwitchNetwork();
  };

  // Block interactions if not on correct network
  const requireCorrectNetwork = () => {
    if (!isOnCorrectNetwork) {
      toast({
        title: "Wrong Network",
        description: `Please switch to ${getTargetChain().name} to continue`,
        variant: "destructive",
      });
      forceNetworkSwitch();
      return false;
    }
    return true;
  };

  // Debug functions for chain switching investigation
  React.useEffect(() => {
    // Add debug functions to window for console access
    (window as any).debugChainSwitching = {
      // Get current chain state
      getCurrentState: () => {
        const chainConfig = getCurrentChainConfig();
        return {
        activeChain,
        chainConfig,
        currentNetwork: getCurrentNetwork(),
        address,
        isConnected,
        chainId,
        walletBalance: walletBalance?.value?.toString(),
        vaultBalance: vaultBalanceData?.toString(),
        currentFee: currentFee?.toString()
        };
      },
      
      // Test chain-specific data fetching
      testChainDataFetching: async () => {
        debugLog('🧪 Testing chain-specific data fetching...');
        const chainConfig = getCurrentChainConfig();
        
        
        debugLog('🏦 Active contract address:', getActiveContractAddress());
        
        // Test wallet balance refetch
        if (refetchWalletBalance) {
          debugLog('🔄 Refetching wallet balance...');
          refetchWalletBalance();
        }
        
        // Test vault balance refetch
        if (refetchVaultBalance) {
          debugLog('🔄 Refetching vault balance...');
          refetchVaultBalance();
        }
        
        // Test token refetch
        if (fetchWalletTokens) {
          debugLog('🔄 Refetching wallet tokens...');
          fetchWalletTokens();
        }
        
        if (refetchVaultTokens) {
          debugLog('🔄 Refetching vault tokens...');
          refetchVaultTokens();
        }
      },
      
      // Force chain data refresh
      forceChainRefresh: async () => {
        debugLog('🚨 Force refreshing all chain data...');
        await fetchChainSpecificData();
      },
      
      // Check if data is stale
      checkDataFreshness: () => {
        const chainConfig = getCurrentChainConfig();
        debugLog('📊 Data Freshness Check:');
        debugLog('  Active Chain:', activeChain);
        debugLog('  Expected Chain ID:', chainConfig.chainId);
        debugLog('  Actual Chain ID:', chainId);
        debugLog('  Chain Match:', chainId === chainConfig.chainId);
        debugLog('  Wallet Balance Source:', walletBalance?.value?.toString());
        debugLog('  Vault Balance Source:', vaultBalanceData?.toString());
      }
    };
    
    
  }, [activeChain, address, isConnected, chainId, walletBalance, vaultBalanceData, currentFee, refetchWalletBalance, refetchVaultBalance, fetchWalletTokens, refetchVaultTokens, fetchChainSpecificData, getCurrentChainConfig, getActiveRpcUrl, getActiveContractAddress]);

  // COMPREHENSIVE DEBUGGING SYSTEM FOR TRANSACTION STATE POLLUTION
  React.useEffect(() => {
    // Add comprehensive debug functions to window for console access
    (window as any).debugTransactionStates = {
      // BUTTON 1: Check Current Transaction State
      checkCurrentState: () => {
        debugLog('🔍 BUTTON 1: CURRENT TRANSACTION STATE ANALYSIS');
        debugLog('================================================');
        debugLog('📍 Active Chain:', activeChain);
        debugLog('📍 Chain ID:', chainId);
        debugLog('📍 Wallet Connected:', isConnected);
        debugLog('📍 Wallet Address:', address);
        debugLog('');
        debugLog('📊 CHAIN-SPECIFIC STATES:');
        debugLog('  isLoading:', isLoading);
        debugLog('  isSimulating:', isSimulating);
        debugLog('  hasRefreshedAfterConfirmation:', hasRefreshedAfterConfirmation);
        debugLog('  lastTransactionHash:', lastTransactionHash);
        debugLog('');
        debugLog('🌐 WAGMI GLOBAL STATES:');
        debugLog('  isWritePending:', isWritePending);
        debugLog('  isConfirming:', isConfirming);
        debugLog('  isConfirmed:', isConfirmed);
        debugLog('  currentHash:', hash);
        debugLog('');
        debugLog('🔗 TRANSACTION ASSOCIATION:');
        debugLog('  isCurrentChainTransaction:', isCurrentChainTransaction);
        debugLog('  isWritePendingForCurrentChain:', isWritePendingForCurrentChain);
        debugLog('  isConfirmingForCurrentChain:', isConfirmingForCurrentChain);
        debugLog('');
        debugLog('⚡ COMBINED LOADING STATE:');
        debugLog('  isTransactionLoading:', isTransactionLoading);
        debugLog('  Final isLoading for UI:', isTransactionLoading);
      },

      // BUTTON 2: Test Chain Switching State Isolation
      testChainIsolation: () => {
        debugLog('🧪 BUTTON 2: TESTING CHAIN STATE ISOLATION');
        debugLog('============================================');
        debugLog('🔄 Simulating chain switch...');
        
        // Show current state before "switch"
        debugLog('📊 BEFORE "SWITCH":');
        debugLog('  ETH States:', chainTransactionStates.ETH);
        debugLog('  BSC States:', chainTransactionStates.BSC);
        debugLog('  BASE States:', chainTransactionStates.BASE);
        debugLog('');
        
        // Show what would happen if we switched
        const otherChains = ['ETH', 'BSC', 'BASE'].filter(c => c !== activeChain);
        otherChains.forEach(chain => {
          debugLog(`🔍 If we switched to ${chain}:`);
          debugLog(`  isLoading: ${chainTransactionStates[chain].isLoading}`);
          debugLog(`  isSimulating: ${chainTransactionStates[chain].isSimulating}`);
          debugLog(`  hasRefreshedAfterConfirmation: ${chainTransactionStates[chain].hasRefreshedAfterConfirmation}`);
          debugLog(`  lastTransactionHash: ${chainTransactionStates[chain].lastTransactionHash}`);
          debugLog('');
        });
        
        debugLog('✅ Chain isolation test completed!');
      },

      // BUTTON 3: Force Reset All Transaction States
      forceResetStates: () => {
        debugLog('🚨 BUTTON 3: FORCE RESETTING ALL TRANSACTION STATES');
        debugLog('==================================================');
        
        // Reset all chain states
        setChainTransactionStates({
          ETH: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null },
          BSC: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null },
          BASE: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null },
          ARB: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null },
          HYPER: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null }
        });
        
        debugLog('🧹 All chain transaction states reset to false');
        debugLog('🔄 This should clear any stuck modal states');
        debugLog('✅ Force reset completed!');
      },

      // NEW BUTTON 6: Nuclear Reset - Clear Everything
      nuclearReset: () => {
        debugLog('☢️ BUTTON 6: NUCLEAR RESET - CLEARING EVERYTHING');
        debugLog('==================================================');
        
        // Reset all chain states
        setChainTransactionStates({
          ETH: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null },
          BSC: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null },
          BASE: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null },
          ARB: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null },
          HYPER: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null }
        });
        
        // Force clear any remaining Wagmi states by triggering a re-render
        debugLog('🧹 All chain transaction states reset');
        debugLog('🔄 Forcing component re-render...');
        
        // This will trigger the aggressive cleanup effect
        debugLog('✅ Nuclear reset completed!');
        debugLog('🔄 Now try switching chains or opening modals');
      },

      // BUTTON 4: Simulate Transaction on Current Chain
      simulateTransaction: () => {
        debugLog('🎭 BUTTON 4: SIMULATING TRANSACTION ON CURRENT CHAIN');
        debugLog('==================================================');
        debugLog(`📍 Simulating on: ${activeChain}`);
        
        // Simulate starting a transaction
        setIsLoading(true);
        debugLog('✅ Set isLoading = true for current chain');
        
        // Simulate transaction hash
        const fakeHash = `0x${Math.random().toString(16).substr(2, 64)}`;
        setLastTransactionHash(fakeHash);
        debugLog('🔗 Set fake transaction hash:', fakeHash);
        
        // Wait 3 seconds then "complete" transaction
        setTimeout(() => {
          setIsLoading(false);
          setLastTransactionHash(null);
          debugLog('⏰ 3 seconds elapsed - simulated transaction completed');
          debugLog('✅ Reset isLoading = false and cleared hash');
        }, 3000);
        
        debugLog('🎬 Simulation started - check console in 3 seconds');
      },

      // BUTTON 5: Deep State Investigation
      deepInvestigation: () => {
        debugLog('🔬 BUTTON 5: DEEP STATE INVESTIGATION');
        debugLog('=====================================');
        
        // Check if there are any stale Wagmi states
        debugLog('🔍 WAGMI STATE ANALYSIS:');
        debugLog('  isWritePending:', isWritePending);
        debugLog('  isConfirming:', isConfirming);
        debugLog('  isConfirmed:', isConfirmed);
        debugLog('  hash:', hash);
        debugLog('');
        
        // Check if our chain-specific filtering is working
        debugLog('🔍 CHAIN FILTERING ANALYSIS:');
        debugLog('  Current hash:', hash);
        debugLog('  Last transaction hash for', activeChain + ':', lastTransactionHash);
        debugLog('  Hash match:', hash === lastTransactionHash);
        debugLog('  isCurrentChainTransaction:', isCurrentChainTransaction);
        debugLog('');
        
        // Check if there are any React state inconsistencies
        debugLog('🔍 REACT STATE CONSISTENCY:');
        debugLog('  Chain states object keys:', Object.keys(chainTransactionStates));
        debugLog('  Current chain state:', chainTransactionStates[activeChain]);
        debugLog('  All chain states:', chainTransactionStates);
        debugLog('');
        
        // Check if there are any circular dependencies
        debugLog('🔍 DEPENDENCY ANALYSIS:');
        debugLog('  activeChain dependency:', activeChain);
        debugLog('  hash dependency:', hash);
        debugLog('  chainTransactionStates dependency:', chainTransactionStates);
        debugLog('');
        
        debugLog('✅ Deep investigation completed!');
      }
    };
    
    // Debug buttons available (development only) - only log once per session
    if (process.env.NODE_ENV === 'development' && !(window as any).debugButtonsLogged) {
      debugLog('🔧 DEBUG BUTTONS AVAILABLE:');
      debugLog('  Button 1: window.debugTransactionStates.checkCurrentState()');
      debugLog('  Button 2: window.debugTransactionStates.testChainIsolation()');
      debugLog('  Button 3: window.debugTransactionStates.forceResetStates()');
      debugLog('  Button 4: window.debugTransactionStates.simulateTransaction()');
      debugLog('  Button 5: window.debugTransactionStates.deepInvestigation()');
      debugLog('  Button 6: window.debugTransactionStates.nuclearReset()');
      (window as any).debugButtonsLogged = true;
    }
    
  }, [activeChain, address, isConnected, chainId, walletBalance, vaultBalanceData, currentFee, refetchWalletBalance, refetchVaultBalance, fetchWalletTokens, refetchVaultTokens, fetchChainSpecificData, getCurrentChainConfig, getActiveRpcUrl, getActiveContractAddress, chainTransactionStates, isLoading, isSimulating, hasRefreshedAfterConfirmation, lastTransactionHash, isWritePending, isConfirming, isConfirmed, hash, isCurrentChainTransaction, isWritePendingForCurrentChain, isConfirmingForCurrentChain, isTransactionLoading, setIsLoading, setLastTransactionHash]);

  // CRITICAL FIX: Create a chain-aware public client that always uses the correct chain
  const createChainAwarePublicClient = useCallback(() => {
    const rpcUrl = getActiveRpcUrl();
    
    // Ensure we have a valid RPC URL
    if (!rpcUrl || typeof rpcUrl !== 'string') {
      throw new Error(`Invalid RPC URL for ${activeChain}`);
    }
    
    // Determine chain ID based on active chain and network mode
    const chainId = activeChain === 'ETH'
      ? (currentNetwork.mode === 'mainnet' ? 1 : 11155111)      // ETH mainnet vs Sepolia
      : activeChain === 'BSC'
      ? (currentNetwork.mode === 'mainnet' ? 56 : 97)           // BSC mainnet vs testnet
      : activeChain === 'BASE'
      ? (currentNetwork.mode === 'mainnet' ? 8453 : 84532)      // BASE mainnet vs Sepolia
      : activeChain === 'ARB'
      ? (currentNetwork.mode === 'mainnet' ? 42161 : 421614)    // Arbitrum One vs Arbitrum Sepolia
      : (currentNetwork.mode === 'mainnet' ? 999 : 998);        // HyperEVM mainnet vs testnet

    // Create the transport with explicit typing
    const transport = http(rpcUrl as `http://${string}` | `https://${string}`);

    return createPublicClient({
      transport,
      chain: {
        id: chainId,
        name:
          activeChain === 'ETH' ? 'Ethereum'
          : activeChain === 'BSC' ? 'Binance Smart Chain'
          : activeChain === 'BASE' ? 'Base'
          : activeChain === 'ARB' ? 'Arbitrum'
          : 'Hyperliquid EVM',
        network:
          activeChain === 'ETH' ? 'ethereum'
          : activeChain === 'BSC' ? 'bsc'
          : activeChain === 'BASE' ? 'base'
          : activeChain === 'ARB' ? 'arbitrum'
          : 'hyperevm',
        nativeCurrency: {
          name:
            activeChain === 'ETH' ? 'Ether'
            : activeChain === 'BSC' ? 'BNB'
            : activeChain === 'BASE' ? 'Ether'
            : activeChain === 'ARB' ? 'Ether'
            : 'HYPE',
          symbol:
            activeChain === 'ETH' ? 'ETH'
            : activeChain === 'BSC' ? 'BNB'
            : activeChain === 'BASE' ? 'ETH'
            : activeChain === 'ARB' ? 'ETH'
            : 'HYPE',
          decimals: 18,
        },
        rpcUrls: {
          default: { http: [rpcUrl] },
          public: { http: [rpcUrl] },
        },
      },
    });
  }, [activeChain, currentNetwork.mode]);

  // NEW: Wagmi-based ETH deposit for comparison with custom implementation
  const depositETHWagmi = async (
    amount: string,
    onProgress?: (steps: _PS[]) => void,
  ) => {
    if (!amount || isNaN(Number(amount))) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    try {
      // CRITICAL FIX: Always get fresh fee before transaction
      debugLog('💰 Getting fresh fee before ETH deposit (Wagmi)...');
      const freshFee = await getCurrentFee();
      if (!freshFee) {
        throw new Error('Failed to get fresh fee');
      }
      
      // Update current fee state with fresh value
      setCurrentFee(freshFee);
      debugLog(`✅ Fresh fee obtained: ${formatEther(freshFee)} ETH`);
      
      // SIMULATION: Check if user has enough balance before proceeding
      setIsSimulating(true);
      
      const amountInWei = parseEther(amount);
      const feeInWei = freshFee;
      const totalValue = amountInWei + feeInWei;
      
      debugLog('🔍 Deposit Simulation (Wagmi):', {
        amount,
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString(),
        totalValue: totalValue.toString(),
        walletBalance: walletBalance ? walletBalance.value.toString() : 'null'
      });
      
      // Check if user has enough ETH for deposit + fee
      if (walletBalance && walletBalance.value < totalValue) {
        const required = formatEther(totalValue);
        const available = formatEther(walletBalance.value);
        debugLog('❌ Insufficient wallet balance for deposit:', { required, available });
        toast({
          title: "Insufficient Balance",
          description: `You need ${required} ETH (${amount} + ${weiToEtherFullPrecision(feeInWei)} fee). You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      debugLog('✅ Deposit simulation successful, proceeding with transaction (Wagmi)');
      
      // Simulation successful - proceed with transaction
      setIsSimulating(false);
      setIsLoading(true);
      
      debugLog('Depositing ETH via Wagmi:', {
        amount,
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString(),
        totalValue: totalValue.toString()
      });

      // Same 3-step lifecycle the multi-X flows use. writeVaultContractAsync
      // still feeds the hook's data → useWaitForTransactionReceipt →
      // isConfirmed auto-refresh path, so the existing balance-refetch
      // effect keeps firing alongside our explicit waitForTransactionReceipt.
      const lc = buildTxLifecycle(onProgress);
      try {
        lc.set(0, 'running', `Open your wallet and sign depositETH(${amount})…`);
        // @wagmi/core action — independent per call (no shared mutation).
        const txHash = await writeContract(config, {
          address: getActiveContractAddress() as `0x${string}`,
          abi: VAULT_ABI as any,
          functionName: 'depositETH',
          args: [],
          value: totalValue, // Send amount + fee together
        });

        lc.set(0, 'done', `Signed & broadcast — tx ${String(txHash).slice(0, 10)}…`);
        lc.advance(1);
        lc.set(1, 'running', 'Waiting for on-chain confirmation…');

        const receipt = await waitForTransactionReceipt(config, { hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error(`depositETH reverted on-chain (block ${receipt.blockNumber})`);
        }
        lc.set(1, 'done', `Confirmed in block ${receipt.blockNumber}`);
        // Release the app-wide isLoading flag as soon as the chain
        // says success — don't wait for the isConfirmed useEffect to
        // catch up (it can lag the explicit waitForTransactionReceipt
        // by hundreds of ms, leaving every per-token button on the
        // home page greyed out during the 12s finality wait).
        setIsLoading(false);

        if (SHOW_LIFECYCLE_CONFIRMATION_TOASTS) {
          toast({
            title: "Deposit Confirmed",
            description: `Deposited ${amount} ETH (+ ${weiToEtherFullPrecision(feeInWei)} fee) to vault`,
          });
        }

        lc.advance(2);
        const finality = getChainFinalityDelay();
        lc.set(2, 'running', `Waiting ${finality / 1000}s for ${activeChain} chain finality, then updating balances…`);
        await new Promise(resolve => setTimeout(resolve, finality));
        // Single-asset hooks use @wagmi/core's writeContract action
        // (no shared mutation state), which means the legacy
        // isConfirmed useEffect that did these refetches doesn't fire
        // for our hash. Do them here so balances/fee/token-lists land.
        refreshAfterTx();
        lc.set(2, 'done', 'Balances updated ✓');
      } catch (innerError: any) {
        lc.set(lc.getPhase(), 'failed', innerError?.shortMessage || innerError?.message || 'Deposit failed');
        throw innerError;
      }

    } catch (error) {
      debugError('Deposit error (Wagmi):', error);
      toast({
        title: "Deposit Failed (Wagmi)",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      setIsSimulating(false);
      setIsLoading(false);
    }
  };

  return {
    isConnected,
    walletBalance: walletBalanceFormatted,
    vaultBalance: vaultBalanceFormatted,
    // Pre-built native-token entries for the multi-token pickers.
    // null when the underlying balance isn't loaded yet.
    walletNativeToken,
    vaultNativeToken,
    currentFee: currentFeeFormatted,
    isLoading: isTransactionLoading,
      isSimulating, // Add simulation state for UI
    depositETH, // ORIGINAL: Custom transaction management
    depositETHWagmi, // NEW: Wagmi-based implementation
    withdrawETH, // ORIGINAL: Custom transaction management
    withdrawETHWagmi, // NEW: Wagmi-based implementation
    transferETH, // ORIGINAL: Custom transaction management
    transferInternalETHWagmi, // NEW: Wagmi-based implementation
      // Token functions (Wagmi-based)
    approveTokenWagmi, // NEW: Wagmi-based token approval
    depositTokenWagmi, // NEW: Wagmi-based token deposit
      depositTokenSmartWagmi, // NEW: Smart deposit with auto-allowance checking (Wagmi)
      depositTokenWithDelay, // SIMPLE: 3-second delay approach (legacy)
      withdrawTokenWagmi, // NEW: Token withdrawal function with approval (Wagmi)
      withdrawMultipleTokensWagmi, // NEW: Multi-token withdrawal function (Wagmi)
      transferInternalTokenWagmi, // NEW: Token transfer function (Wagmi)
      transferMultipleTokensWagmi, // NEW: Multi-token transfer function (Wagmi)
      depositMultipleTokensWagmi, // NEW: Multi-token deposit function (Wagmi)
      getRateLimitStatus, // NEW: Rate limit status function
      // Transaction status for UI feedback (chain-specific)
    isPending: isWritePendingForCurrentChain,
    isConfirming: isConfirmingForCurrentChain,
    isConfirmed,
    hash,
      // Token detection data
    walletTokens,
    vaultTokens,
    isLoadingWalletTokens,
    isLoadingVaultTokens,
    isLoadingTokens,
    refetchWalletTokens: fetchWalletTokens,
      refetchVaultTokens: fetchVaultTokensSigned, // CRITICAL FIX: Use our working function instead of Wagmi refetch
      // Network switching functions
    currentNetwork,
    isSwitchingNetwork,
    autoSwitchNetwork,
      getTargetChain: getTargetChain,
      isOnCorrectNetwork, // Add this line
      forceNetworkSwitch, // Add this line
      requireCorrectNetwork, // Add this line
      fetchChainSpecificData, // Add this line
    };
};
