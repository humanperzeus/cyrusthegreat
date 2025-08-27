import React, { useState, useCallback, useEffect } from 'react';
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { readContract, waitForTransactionReceipt, writeContract } from '@wagmi/core';
import { sepolia, mainnet, bsc, bscTestnet, base, baseSepolia } from 'wagmi/chains';
import { formatEther, parseEther, parseUnits } from 'viem';
import { getContract } from 'viem';
import { WEB3_CONFIG, VAULT_ABI, getContractAddress, getCurrentNetwork, getRpcUrl, getChainConfig, getBestRpcUrl, getChainNetworkInfo } from '@/config/web3';
import { config } from '@/lib/wagmi';
import { useToast } from '@/hooks/use-toast';
import { decodeFunctionResult, encodeFunctionData } from 'viem';
import { createPublicClient, http } from 'viem';
import { debugLog, debugWarn, debugError, weiToEtherFullPrecision, fetchTokenDecimals, fetchTokenSymbol, formatTokenBalance, bigIntToFullPrecisionString } from '@/lib/utils';

// Add window.ethereum type
declare global {
  interface Window {
    ethereum?: any;
  }
}

export const useVault = (activeChain: 'ETH' | 'BSC' | 'BASE' = 'ETH') => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { toast } = useToast();
  const { switchChain } = useSwitchChain();

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
        : (currentNetwork.mode === 'mainnet' ? 8453 : 84532);
      
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
    }
    
    // Fallback to ETH if activeChain is not recognized
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

  // Contract write hooks for real transactions
  const { writeContract: writeVaultContract, data: hash, isPending: isWritePending } = useWriteContract();
  
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
    BASE: { ...defaultChainState }
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
      } else if (activeChain === 'BASE') {
        // Use Alchemy API for BASE chains (same as ETH/BSC, just different RPC)
        const alchemyUrl = getActiveRpcUrl();

        // Use Alchemy API to get token balances (same method as ETH/BSC)
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

          // CRITICAL FIX: Store raw balance as string to preserve full precision
          // Use the robust BigInt to string conversion function
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

  // Token approval hook
  const approveToken = async (tokenAddress: string, amount: bigint) => {
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

  // Extended deposit function for tokens
  const depositToken = async (tokenAddress: string, amount: string, tokenSymbol: string) => {
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

      // Step 2: Convert amount using proper decimals
      const amountWei = parseUnits(amount, decimals);
      debugLog(`💰 Amount in wei:`, amountWei.toString());

      // Step 3: First approve the token
      const approved = await approveToken(tokenAddress, amountWei);
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
  const depositTokenSmart = async (tokenAddress: string, amount: string, tokenSymbol: string) => {
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

      // Step 2: Convert amount using proper decimals
      const amountWei = parseUnits(amount, decimals);
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
        // Skip approval, go straight to deposit
        await executeTokenDeposit(tokenAddress, amountWei, tokenSymbol);
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

  const depositMultipleTokens = async (deposits: { token: string; amount: string }[]) => {
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

    try {
      // CRITICAL FIX: Separate ETH and ERC20 deposits for proper handling
      const ethDeposits = deposits.filter(d => {
        const tokenAddress = typeof d.token === 'string' ? d.token : d.token.address;
        return tokenAddress === '0x0000000000000000000000000000000000000000';
      });
      
      const tokenDeposits = deposits.filter(d => {
        const tokenAddress = typeof d.token === 'string' ? d.token : d.token.address;
        return tokenAddress !== '0x0000000000000000000000000000000000000000';
      });
      
      console.log('🔍 ETH deposits found:', ethDeposits.length);
      console.log('🔍 Token deposits count:', tokenDeposits.length);
      
      // CRITICAL FIX: Handle ETH deposits separately from token deposits
      if (ethDeposits.length > 0) {
        console.log('💰 Processing ETH deposits separately...');
        for (const ethDeposit of ethDeposits) {
          try {
            const ethAmount = parseEther(ethDeposit.amount);
            console.log(`💰 Depositing ${formatEther(ethAmount)} ETH...`);
            
            // Get fresh fee for ETH deposit
            const freshFee = await getCurrentFee();
            if (!freshFee) {
              throw new Error('Failed to get fresh fee for ETH deposit');
            }
            
            // Calculate total ETH value (deposit amount + fee)
            const totalEthValue = ethAmount + freshFee;
            console.log(`💰 Total ETH value: ${formatEther(totalEthValue)} (deposit: ${formatEther(ethAmount)} + fee: ${formatEther(freshFee)})`);
            
            // Check wallet balance
            if (walletBalance && walletBalance.value < totalEthValue) {
              const required = formatEther(totalEthValue);
              const available = formatEther(walletBalance.value);
              toast({
                title: "Insufficient Balance for ETH Deposit",
                description: `You need ${required} ETH (${formatEther(ethAmount)} + ${formatEther(freshFee)} fee). You have ${available} ETH.`,
                variant: "destructive",
              });
              return;
            }
            
            // Execute ETH deposit
            const ethDepositHash = await writeContract(config, {
              address: getActiveContractAddress() as `0x${string}`,
              abi: VAULT_ABI,
              functionName: 'depositETH',
              args: [],
              value: totalEthValue, // Send deposit amount + fee
            });
            
            console.log('✅ ETH deposit transaction submitted:', ethDepositHash);
            toast({
              title: "ETH Deposit Initiated",
              description: `Depositing ${formatEther(ethAmount)} ETH to vault...`,
            });
            
          } catch (error) {
            console.error('❌ ETH deposit failed:', error);
            toast({
              title: "ETH Deposit Failed",
              description: error instanceof Error ? error.message : "Unknown error occurred",
              variant: "destructive",
            });
            return;
          }
        }
      }

      // CRITICAL FIX: Only handle ERC20 tokens in multi-token contract call (ETH handled separately above)
      if (tokenDeposits.length === 0) {
        console.log('✅ Only ETH deposits - no ERC20 tokens to process');
        return; // All deposits were ETH, already processed above
      }
      
      console.log('🔄 Processing ERC20 token deposits...');
      
      // Prepare contract call data for ERC20 tokens only
      const tokens = tokenDeposits.map(d => typeof d.token === 'string' ? d.token : d.token.address);
      const amounts = tokenDeposits.map(d => {
        const tokenAddress = typeof d.token === 'string' ? d.token : d.token.address;
        const tokenInfo = walletTokens.find(t => t.address === tokenAddress);
        const decimals = tokenInfo?.decimals || 18;
        return parseUnits(d.amount, decimals).toString();
      });

      // Calculate ETH value to send (ETH deposit amount only)
      let ethValueToSend = parseEther('0');
      if (ethDeposit) {
        ethValueToSend = parseEther(ethDeposit.amount);
        console.log('💰 ETH deposit amount:', formatEther(ethValueToSend));
      }

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
      
      // Calculate total ETH value (ETH deposit + fee)
      const totalEthValue = ethValueToSend + feeInWei;
      console.log('💵 Total ETH value (ETH deposit + fee):', formatEther(totalEthValue));

      // Check and handle approvals for all token deposits
      console.log('🔐 Checking approvals for token deposits...');
      const approvalTokenDeposits = deposits.filter(d => {
        const tokenAddress = typeof d.token === 'string' ? d.token : d.token.address;
        return tokenAddress !== '0x0000000000000000000000000000000000000000';
      });

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
          const requiredAmount = parseUnits(deposit.amount, decimals);
          console.log(`  ${tokenAddress}: Current allowance: ${currentAllowance}, Required: ${requiredAmount}`);

          if (BigInt(currentAllowance as string) < requiredAmount) {
            console.log(`  🔄 Approving ${tokenAddress}...`);

            // Determine approval amount based on user's choice (deposit.approvalType)
            // CRITICAL FIX: Add precision buffer for exact approvals to prevent leftover dust
            const approvalAmount = deposit.approvalType === 'exact'
              ? requiredAmount + (requiredAmount / 10000n)  // Add 0.01% buffer for exact
              : 2n ** 256n - 1n; // Unlimited approval

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
          } else {
            console.log(`  ✅ ${tokenAddress} already approved`);
          }
        } catch (error: any) {
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
      console.log('ETH deposit included:', !!ethDeposit);
      console.log('Token deposits count:', approvalTokenDeposits.length);

      const depositHash = await writeContract(config, {
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'depositMultipleTokens',
        args: [tokens, amounts],
        value: totalEthValue,
      });

      console.log('✅ Multi-token deposit transaction submitted:', depositHash);

      toast({
        title: "Multi-token deposit initiated",
        description: `Depositing ${deposits.length} tokens to vault`,
      });

      return { hash: depositHash };

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

      // Step 2: Convert amount using proper decimals
      const amountWei = parseUnits(amount, decimals);
      debugLog(`💰 Amount in wei:`, amountWei.toString());

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

  // Helper: Execute token deposit (when allowance is sufficient)
  const executeTokenDeposit = async (tokenAddress: string, amount: bigint, tokenSymbol: string) => {
    try {
      debugLog(`🚀 Executing direct deposit for ${tokenSymbol}...`);
      
      // CRITICAL FIX: Always get fresh fee before transaction
      debugLog('💰 Getting fresh fee before token deposit...');
      const freshFee = await getCurrentFee();
      if (!freshFee) {
        throw new Error('Failed to get fresh fee');
      }
      
      // Update current fee state with fresh value
      setCurrentFee(freshFee);
      debugLog(`✅ Fresh fee obtained: ${formatEther(freshFee)} ETH`);
      
      const feeWei = freshFee;
      debugLog(`💰 Using fresh fee: ${feeWei} wei (${formatEther(feeWei)} ETH)`);
      
      // Call the actual vault deposit function WITH ETH fee
      await writeVaultContract({
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'depositToken',
        args: [tokenAddress, amount],
        chain: getTargetChain(),
        account: address,
        value: feeWei, // Send ETH fee along with token deposit
      });
      
      debugLog(`📝 Direct token deposit transaction initiated with ETH fee`);
      
      toast({
        title: "Token Deposit Initiated",
        description: `Depositing ${formatEther(amount)} ${tokenSymbol} + ${formatEther(feeWei)} ETH fee to vault...`,
      });
      
      // DON'T refresh here - let the transaction confirmation system handle it
      // DON'T set isLoading(false) here - let the transaction confirmation system handle it
      
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
      
      // Step 1: Send approval transaction with precision buffer
      // CRITICAL FIX: Approve slightly more to account for precision differences
      const approvalAmount = amount + (amount / 10000n); // Add 0.01% buffer
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
  const withdrawToken = async (tokenAddress: string, amount: string, tokenSymbol: string) => {
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

      // Step 2: Convert amount using proper decimals
      const amountWei = parseUnits(amount, decimals);
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

      // Call the vault withdraw function WITH ETH fee
      await writeVaultContract({
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'withdrawToken',
        args: [tokenAddress, amountWei],
        chain: getTargetChain(),
        account: address,
        value: feeWei, // Send ETH fee along with token withdrawal
      });
      
      debugLog(`📝 Token withdrawal transaction initiated with ETH fee`);
      
      toast({
        title: "Token Withdrawal Initiated",
        description: `Withdrawing ${amount} ${tokenSymbol} + ${formatEther(feeWei)} ETH fee from vault...`,
      });
      
      // DON'T refresh here - let the transaction confirmation system handle it
      // DON'T set isLoading(false) here - let the transaction confirmation system handle it
      
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

  const withdrawMultipleTokens = async (withdrawals: { token: string; amount: string }[]) => {
    console.log('withdrawMultipleTokens called with:', withdrawals);
    console.log('Address:', address);
    console.log('Is connected:', isConnected);

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

    try {
      // CRITICAL FIX: Separate ETH and ERC20 withdrawals for proper handling
      const ethWithdrawals = withdrawals.filter(withdrawal => {
        const tokenAddress = typeof withdrawal.token === 'string' ? withdrawal.token : withdrawal.token.address;
        return tokenAddress === '0x0000000000000000000000000000000000000000';
      });
      
      const tokenWithdrawals = withdrawals.filter(withdrawal => {
        const tokenAddress = typeof withdrawal.token === 'string' ? withdrawal.token : withdrawal.token.address;
        return tokenAddress !== '0x0000000000000000000000000000000000000000';
      });
      
      console.log('🔍 ETH withdrawals found:', ethWithdrawals.length);
      console.log('🔍 Token withdrawals count:', tokenWithdrawals.length);
      
      // CRITICAL FIX: Handle ETH withdrawals separately from token withdrawals
      if (ethWithdrawals.length > 0) {
        console.log('💰 Processing ETH withdrawals separately...');
        for (const ethWithdrawal of ethWithdrawals) {
          try {
            const ethAmount = parseEther(ethWithdrawal.amount);
            console.log(`💰 Withdrawing ${formatEther(ethAmount)} ETH...`);
            
            // Get fresh fee for ETH withdrawal
            const freshFee = await getCurrentFee();
            if (!freshFee) {
              throw new Error('Failed to get fresh fee for ETH withdrawal');
            }
            
            // Execute ETH withdrawal
            const ethWithdrawalHash = await writeContract(config, {
              address: getActiveContractAddress() as `0x${string}`,
              abi: VAULT_ABI,
              functionName: 'withdrawETH',
              args: [ethAmount],
            });
            
            console.log('✅ ETH withdrawal transaction submitted:', ethWithdrawalHash);
            toast({
              title: "ETH Withdrawal Initiated",
              description: `Withdrawing ${formatEther(ethAmount)} ETH from vault...`,
            });
            
          } catch (error) {
            console.error('❌ ETH withdrawal failed:', error);
            toast({
              title: "ETH Withdrawal Failed",
              description: error instanceof Error ? error.message : "Unknown error occurred",
              variant: "destructive",
            });
            return;
          }
        }
      }

      // CRITICAL FIX: Only validate ERC20 tokens (ETH handled separately above)
      if (tokenWithdrawals.length > 0) {
        console.log('🔄 Validating ERC20 token withdrawals...');
        for (const withdrawal of tokenWithdrawals) {
          const tokenAddress = typeof withdrawal.token === 'string' ? withdrawal.token : withdrawal.token.address;
          const tokenInfo = vaultTokens.find(t => t.address === tokenAddress);

          if (!tokenInfo) {
            toast({
              title: "Token not found in vault",
              description: `Token ${tokenAddress} is not available in your vault`,
              variant: "destructive",
            });
            return;
          }

          const vaultBalance = parseFloat(tokenInfo.balance);
          const withdrawalAmount = parseFloat(withdrawal.amount);

          if (withdrawalAmount > vaultBalance) {
            toast({
              title: "Insufficient vault balance",
              description: `You only have ${vaultBalance} ${tokenInfo.symbol} in your vault`,
              variant: "destructive",
            });
            return;
          }
        }
      }

      // CRITICAL FIX: Only handle ERC20 tokens in multi-token contract call (ETH handled separately above)
      if (tokenWithdrawals.length === 0) {
        console.log('✅ Only ETH withdrawals - no ERC20 tokens to process');
        return; // All withdrawals were ETH, already processed above
      }
      
      console.log('🔄 Processing ERC20 token withdrawals...');
      
      // Prepare contract call data for ERC20 tokens only
      const tokens = tokenWithdrawals.map(d => typeof d.token === 'string' ? d.token : d.token.address);
      const amounts = tokenWithdrawals.map(d => {
        const tokenAddress = typeof d.token === 'string' ? d.token : d.token.address;
        const tokenInfo = vaultTokens.find(t => t.address === tokenAddress);
        const decimals = tokenInfo?.decimals || 18;
        return parseUnits(d.amount, decimals).toString();
      });

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

      const depositHash = await writeContract(config, {
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'withdrawMultipleTokens',
        args: [tokens, amounts],
        value: feeInWei,
      });

      console.log('✅ Multi-token withdrawal transaction submitted:', depositHash);

      toast({
        title: "Multi-token withdrawal initiated",
        description: `Withdrawing ${withdrawals.length} tokens from vault`,
      });

      return { hash: depositHash };

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

  const transferMultipleTokens = async (transfers: { token: string; amount: string }[], to: string) => {
    console.log('transferMultipleTokens called with:', transfers, 'to:', to);
    console.log('Address:', address);
    console.log('Is connected:', isConnected);

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

      // CRITICAL FIX: Separate ETH and ERC20 transfers for proper handling
      const ethTransfers = transfers.filter(transfer => {
        const tokenAddress = typeof transfer.token === 'string' ? transfer.token : transfer.token.address;
        return tokenAddress === '0x0000000000000000000000000000000000000000';
      });
      
      const tokenTransfers = transfers.filter(transfer => {
        const tokenAddress = typeof transfer.token === 'string' ? transfer.token : transfer.token.address;
        return tokenAddress !== '0x0000000000000000000000000000000000000000';
      });
      
      console.log('🔍 ETH transfers found:', ethTransfers.length);
      console.log('🔍 Token transfers count:', tokenTransfers.length);
      
      // CRITICAL FIX: Handle ETH transfers separately from token transfers
      if (ethTransfers.length > 0) {
        console.log('💰 Processing ETH transfers separately...');
        for (const ethTransfer of ethTransfers) {
          try {
            const ethAmount = parseEther(ethTransfer.amount);
            console.log(`💰 Transferring ${formatEther(ethAmount)} ETH to ${to}...`);
            
            // Get fresh fee for ETH transfer
            const freshFee = await getCurrentFee();
            if (!freshFee) {
              throw new Error('Failed to get fresh fee for ETH transfer');
            }
            
            // Execute ETH transfer
            const ethTransferHash = await writeContract(config, {
              address: getActiveContractAddress() as `0x${string}`,
              abi: VAULT_ABI,
              functionName: 'transferETH',
              args: [to, ethAmount],
            });
            
            console.log('✅ ETH transfer transaction submitted:', ethTransferHash);
            toast({
              title: "ETH Transfer Initiated",
              description: `Transferring ${formatEther(ethAmount)} ETH to ${to}...`,
            });
            
          } catch (error) {
            console.error('❌ ETH transfer failed:', error);
            toast({
              title: "ETH Transfer Failed",
              description: error instanceof Error ? error.message : "Unknown error occurred",
              variant: "destructive",
            });
            return;
          }
        }
      }
      
      // CRITICAL FIX: Only validate ERC20 tokens (ETH handled separately above)
      if (tokenTransfers.length > 0) {
        console.log('🔄 Validating ERC20 token transfers...');
        for (const transfer of tokenTransfers) {
          const tokenAddress = typeof transfer.token === 'string' ? transfer.token : transfer.token.address;
          const tokenInfo = vaultTokens.find(t => t.address === tokenAddress);

          if (!tokenInfo) {
            toast({
              title: "Token not found in vault",
              description: `Token ${tokenAddress} is not available in your vault`,
              variant: "destructive",
            });
            return;
          }

          const vaultBalance = parseFloat(tokenInfo.balance);
          const transferAmount = parseFloat(transfer.amount);

          if (transferAmount > vaultBalance) {
            toast({
              title: "Insufficient vault balance",
              description: `You only have ${vaultBalance} ${tokenInfo.symbol} in your vault`,
              variant: "destructive",
            });
            return;
          }
        }
      }

      // CRITICAL FIX: Only handle ERC20 tokens in multi-token contract call (ETH handled separately above)
      if (tokenTransfers.length === 0) {
        console.log('✅ Only ETH transfers - no ERC20 tokens to process');
        return; // All transfers were ETH, already processed above
      }
      
      console.log('🔄 Processing ERC20 token transfers...');
      
      // Prepare contract call data for ERC20 tokens only
      const tokens = tokenTransfers.map(t => typeof t.token === 'string' ? t.token : t.token.address);
      const amounts = tokenTransfers.map(t => {
        const tokenAddress = typeof t.token === 'string' ? t.token : t.token.address;
        const tokenInfo = vaultTokens.find(t => t.address === tokenAddress);
        const decimals = tokenInfo?.decimals || 18;
        return parseUnits(t.amount, decimals).toString();
      });

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

      const transferHash = await writeContract(config, {
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'transferMultipleTokensInternal',
        args: [tokens, to, amounts],
        value: feeInWei,
      });

      console.log('✅ Multi-token transfer transaction submitted:', transferHash);

      toast({
        title: "Multi-token transfer initiated",
        description: `Transferring ${transfers.length} tokens to ${to.slice(0, 6)}...${to.slice(-4)}`,
      });

      return { hash: transferHash };

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
  const transferInternalToken = async (
    tokenAddress: string,
    to: string,
    amount: string,
    tokenSymbol: string
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

      // Step 2: Convert amount using proper decimals (like your working project)
      const amountWei = parseUnits(amount, decimals);
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

      // Step 5: Execute token transfer (like your working project)
      debugLog(`🚀 Calling transferInternalToken with:`, {
        tokenAddress,
        to,
        amountWei: amountWei.toString(),
        feeWei: feeWei.toString()
      });

      const result = await writeVaultContract({
        address: getActiveContractAddress() as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'transferInternalToken',
        args: [tokenAddress, to, amountWei],
        chain: getTargetChain(),
        account: address,
        value: feeWei,
      });

      debugLog(`📝 Token transfer transaction result:`, result);
      
      toast({
        title: "Token Transfer Initiated",
        description: `Transferring ${amount} ${tokenSymbol} to ${to.slice(0, 6)}...${to.slice(-4)} + ${formatEther(feeWei)} ETH fee...`,
      });
      
      // DON'T refresh here - let the transaction confirmation system handle it
      // DON'T set isLoading(false) here - let the transaction confirmation system handle it
      
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
      
      toast({
        title: "Transaction Confirmed!",
        description: "Your transaction has been confirmed on the blockchain",
      });
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
      
      // Show user-friendly notification with delay time
      toast({
        title: "Transaction Confirmed!",
        description: `Waiting ${finalityDelay/1000} seconds for ${activeChain} chain finality, then updating balances...`,
        variant: "default",
      });
      
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
  const isTransactionLoading = isLoading || isWritePendingForCurrentChain || isConfirmingForCurrentChain;

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
          BASE: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null }
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
          BASE: { isLoading: false, isSimulating: false, hasRefreshedAfterConfirmation: false, lastTransactionHash: null }
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
      : (currentNetwork.mode === 'mainnet' ? 8453 : 84532);     // BASE mainnet vs Sepolia
    
    // Create the transport with explicit typing
    const transport = http(rpcUrl as `http://${string}` | `https://${string}`);
    
    return createPublicClient({
      transport,
      chain: {
        id: chainId,
        name: activeChain === 'ETH' ? 'Ethereum' : activeChain === 'BSC' ? 'Binance Smart Chain' : 'Base',
        network: activeChain === 'ETH' ? 'ethereum' : activeChain === 'BSC' ? 'bsc' : 'base',
        nativeCurrency: {
          name: activeChain === 'ETH' ? 'Ether' : activeChain === 'BSC' ? 'BNB' : 'Ether',
          symbol: activeChain === 'ETH' ? 'ETH' : activeChain === 'BSC' ? 'BNB' : 'ETH',
          decimals: 18,
        },
        rpcUrls: {
          default: { http: [rpcUrl] },
          public: { http: [rpcUrl] },
        },
      },
    });
  }, [activeChain, currentNetwork.mode]);

  return {
    isConnected,
    walletBalance: walletBalanceFormatted,
    vaultBalance: vaultBalanceFormatted,
    currentFee: currentFeeFormatted,
    isLoading: isTransactionLoading,
      isSimulating, // Add simulation state for UI
    depositETH,
    withdrawETH,
    transferETH,
      // Token functions
    approveToken,
    depositToken,
      depositTokenSmart, // NEW: Smart deposit with auto-allowance checking
      depositTokenWithDelay, // SIMPLE: 3-second delay approach
      withdrawToken, // NEW: Token withdrawal function with approval
      withdrawMultipleTokens, // NEW: Multi-token withdrawal function
      transferInternalToken, // NEW: Token transfer function
      transferMultipleTokens, // NEW: Multi-token transfer function
      depositMultipleTokens, // NEW: Multi-token deposit function
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
