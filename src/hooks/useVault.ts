import React, { useState } from 'react';
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { formatEther, parseEther } from 'viem';
import { getContract } from 'viem';
import { WEB3_CONFIG, VAULT_ABI } from '@/config/web3';
import { useToast } from '@/hooks/use-toast';

export const useVault = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { toast } = useToast();
  
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
  const { data: vaultBalanceData, refetch: refetchVaultBalance } = useReadContract({
    address: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
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

  // Debug logging for vault balance fetching
  React.useEffect(() => {
    console.log('🔍 Vault Balance Fetching Debug:', {
      address,
      contractAddress: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS,
      args: address ? [address, '0x0000000000000000000000000000000000000000'] : undefined,
      vaultBalanceData,
      vaultBalanceDataType: typeof vaultBalanceData,
      vaultBalanceDataValue: vaultBalanceData?.toString(),
      isEnabled: !!address
    });
  }, [address, vaultBalanceData]);

  // Get current fee from contract
  const { data: currentFee, refetch: refetchFee } = useReadContract({
    address: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
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

  // Get vault tokens for the connected user - using signed call since it's private
  const { data: vaultTokensData, refetch: refetchVaultTokens } = useReadContract({
    address: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
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

  // NEW: Signed call for vault tokens since getMyVaultedTokens is private
  const fetchVaultTokensSigned = async () => {
    if (!address || !isConnected) return;
    
    try {
      console.log('🔐 Fetching vault tokens with signed call...');
      
      if (!publicClient || !walletClient) {
        console.error('❌ Public client or wallet client not available');
        return;
      }
      
      // Make a direct call to the private function
      const result = await publicClient.readContract({
        address: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'getMyVaultedTokens',
        args: [],
        account: address,
      });
      
      console.log('✅ Vault tokens fetched with signed call:', result);
      
      // Process the result directly
      if (result && Array.isArray(result)) {
        const [tokenAddresses, tokenBalances] = result;
        console.log('🔍 Raw vault tokens result:', { tokenAddresses, tokenBalances });
        
        // Process tokens with real metadata
        const processVaultTokens = async () => {
          console.log('🔄 Starting vault token processing from signed call...');
          const processedTokens = [];
          
          for (let i = 0; i < tokenAddresses.length; i++) {
            const tokenAddr = tokenAddresses[i];
            const tokenBalance = tokenBalances[i];
            
            // Skip native ETH (address 0) - it's already displayed in top balance
            if (tokenAddr === '0x0000000000000000000000000000000000000000') {
              console.log('⏭️ Skipping native ETH (address 0) - already displayed in top balance');
              continue;
            }
            
            console.log(`🔄 Processing token ${i}:`, { address: tokenAddr, balance: tokenBalance });
            
            try {
              // Fetch token metadata (symbol, decimals) from the token contract
              const metadataResponse = await fetch(`https://eth-sepolia.g.alchemy.com/v2/${WEB3_CONFIG.ALCHEMY_API_KEY}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'alchemy_getTokenMetadata',
                  params: [tokenAddr]
                })
              });

              if (metadataResponse.ok) {
                const metadata = await metadataResponse.json();
                console.log(`📡 Token metadata for ${tokenAddr}:`, metadata);
                
                if (metadata.result) {
                  const processedToken = {
                    address: tokenAddr,
                    symbol: metadata.result.symbol || 'UNKNOWN',
                    balance: tokenBalance ? formatEther(tokenBalance as bigint) : '0',
                    decimals: metadata.result.decimals || 18
                  };
                  
                  processedTokens.push(processedToken);
                  console.log(`✅ Token processed:`, processedToken);
                }
              } else {
                // Fallback if metadata fetch fails
                const fallbackToken = {
                  address: tokenAddr,
                  symbol: 'UNKNOWN',
                  balance: tokenBalance ? formatEther(tokenBalance as bigint) : '0',
                  decimals: 18
                };
                processedTokens.push(fallbackToken);
                console.log(`⚠️ Token fallback:`, fallbackToken);
              }
            } catch (error) {
              console.error(`❌ Error fetching metadata for token ${tokenAddr}:`, error);
              // Fallback on error
              const errorToken = {
                address: tokenAddr,
                symbol: 'UNKNOWN',
                balance: tokenBalance ? formatEther(tokenBalance as bigint) : '0',
                decimals: 18
              };
              processedTokens.push(errorToken);
              console.log(`❌ Token error fallback:`, errorToken);
            }
          }
          
          console.log('✅ Final processed vault tokens (ETH filtered out):', processedTokens);
          setVaultTokens(processedTokens);
        };
        
        processVaultTokens();
      }
      
    } catch (error) {
      console.error('❌ Error fetching vault tokens with signed call:', error);
    }
  };

  // Contract write hooks for real transactions
  const { writeContract: writeVaultContract, data: hash, isPending: isWritePending } = useWriteContract();
  
  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [hasRefreshedAfterConfirmation, setHasRefreshedAfterConfirmation] = useState(false);
  
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
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);

  const walletBalanceFormatted = walletBalance ? formatEther(walletBalance.value) : '0.00';
  const vaultBalanceFormatted = vaultBalanceData ? formatEther(vaultBalanceData as bigint) : '0.00';
  const currentFeeFormatted = currentFee ? formatEther(currentFee as bigint) : '0.00';

  // Debug logging
  console.log('Vault Hook State:', {
    isConnected,
    walletBalance: walletBalanceFormatted,
    vaultBalance: vaultBalanceFormatted,
    currentFee: currentFeeFormatted,
    currentFeeRaw: currentFee,
    address
  });

  // Track when data loads/refetches
  React.useEffect(() => {
    if (walletBalance) {
      console.log('💰 Wallet balance loaded/updated:', formatEther(walletBalance.value));
    }
  }, [walletBalance]);

  React.useEffect(() => {
    if (vaultBalanceData) {
      console.log('📊 Vault balance loaded/updated:', formatEther(vaultBalanceData as bigint));
    }
  }, [vaultBalanceData]);

  React.useEffect(() => {
    if (currentFee) {
      console.log('💸 Current fee loaded/updated:', formatEther(currentFee as bigint));
    }
  }, [currentFee]);

  // Fetch wallet tokens via RPC
  const fetchWalletTokens = async () => {
    if (!address) return;
    
    try {
      setIsLoadingTokens(true);
      console.log('🔍 Fetching wallet tokens for address:', address);
      console.log('🔑 Using Alchemy API key:', WEB3_CONFIG.ALCHEMY_API_KEY);
      
      // Use Alchemy API to get token balances
      const response = await fetch(`https://eth-sepolia.g.alchemy.com/v2/${WEB3_CONFIG.ALCHEMY_API_KEY}`, {
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

      console.log('📡 HTTP Response status:', response.status);
      console.log('📡 HTTP Response headers:', response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      console.log('📡 Full Alchemy API response:', JSON.stringify(data, null, 2));

      if (data.error) {
        console.error('❌ Alchemy API error:', data.error);
        throw new Error(`Alchemy API error: ${data.error.message}`);
      }

      if (data.result && data.result.tokenBalances) {
        console.log('✅ Token balances found:', data.result.tokenBalances);
        
        // Process tokens with proper hex balance parsing and metadata fetching
        const processTokens = async () => {
          const processedTokens = [];
          
          for (const token of data.result.tokenBalances) {
            try {
              // Parse hex balance to decimal
              const balanceHex = token.tokenBalance;
              const balanceDecimal = parseInt(balanceHex, 16);
              
              console.log(`🔍 Processing token ${token.contractAddress}:`);
              console.log(`   Hex balance: ${balanceHex}`);
              console.log(`   Decimal balance: ${balanceDecimal}`);
              
              // Only process tokens with balance > 0
              if (balanceDecimal > 0) {
                // Fetch token metadata (symbol, decimals)
                const metadataResponse = await fetch(`https://eth-sepolia.g.alchemy.com/v2/${WEB3_CONFIG.ALCHEMY_API_KEY}`, {
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
                  console.log(`📡 Metadata for ${token.contractAddress}:`, metadata);
                  
                  if (metadata.result) {
                    symbol = metadata.result.symbol || 'UNKNOWN';
                    decimals = metadata.result.decimals || 18;
                  }
                }

                // Calculate human-readable balance
                const humanBalance = balanceDecimal / Math.pow(10, decimals);
                
                processedTokens.push({
                  address: token.contractAddress,
                  symbol: symbol,
                  balance: humanBalance.toFixed(4).replace(/\.?0+$/, ''), // Clean decimal display like ETH
                  decimals: decimals
                });
                
                console.log(`✅ Token processed: ${symbol} = ${humanBalance.toFixed(4).replace(/\.?0+$/, '')}`);
              }
            } catch (error) {
              console.error(`❌ Error processing token ${token.contractAddress}:`, error);
            }
          }
          
          console.log('✅ All tokens processed:', processedTokens);
          setWalletTokens(processedTokens);
        };
        
        processTokens();
      } else {
        console.log('ℹ️ No token balances in response:', data.result);
        setWalletTokens([]);
      }
      
    } catch (error) {
      console.error('❌ Error fetching wallet tokens:', error);
      // Fallback to empty array on error
      setWalletTokens([]);
    } finally {
      setIsLoadingTokens(false);
    }
  };

  // Process vault tokens data from contract
  React.useEffect(() => {
    console.log('🔍 Vault tokens effect triggered with data:', vaultTokensData);
    console.log('🔍 Vault tokens data type:', typeof vaultTokensData);
    console.log('🔍 Vault tokens data is array:', Array.isArray(vaultTokensData));
    
    if (vaultTokensData && Array.isArray(vaultTokensData)) {
      console.log('🔍 Processing vault tokens data:', vaultTokensData);
      
      // The contract returns [address[] tokens, uint256[] balances]
      const [tokenAddresses, tokenBalances] = vaultTokensData;
      
      console.log('🔍 Token addresses:', tokenAddresses);
      console.log('🔍 Token balances:', tokenBalances);
      console.log('🔍 Addresses is array:', Array.isArray(tokenAddresses));
      console.log('🔍 Balances is array:', Array.isArray(tokenBalances));
      
      if (Array.isArray(tokenAddresses) && Array.isArray(tokenBalances)) {
        // Process tokens with real metadata
        const processVaultTokens = async () => {
          console.log('🔄 Starting vault token processing...');
          const processedTokens = [];
          
          for (let i = 0; i < tokenAddresses.length; i++) {
            const tokenAddr = tokenAddresses[i];
            const tokenBalance = tokenBalances[i];
            
            // Skip native ETH (address 0) - it's already displayed in top balance
            if (tokenAddr === '0x0000000000000000000000000000000000000000') {
              console.log('⏭️ Skipping native ETH (address 0) - already displayed in top balance');
              continue;
            }
            
            try {
              // Fetch token metadata (symbol, decimals) from the token contract
              const metadataResponse = await fetch(`https://eth-sepolia.g.alchemy.com/v2/${WEB3_CONFIG.ALCHEMY_API_KEY}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'alchemy_getTokenMetadata',
                  params: [tokenAddr]
                })
              });

              if (metadataResponse.ok) {
                const metadata = await metadataResponse.json();
                console.log(`📡 Token metadata for ${tokenAddr}:`, metadata);
                
                if (metadata.result) {
                  const processedToken = {
                    address: tokenAddr,
                    symbol: metadata.result.symbol || 'UNKNOWN',
                    balance: tokenBalance ? formatEther(tokenBalance as bigint) : '0',
                    decimals: metadata.result.decimals || 18
                  };
                  
                  processedTokens.push(processedToken);
                  console.log(`✅ Token processed:`, processedToken);
                }
              } else {
                // Fallback if metadata fetch fails
                const fallbackToken = {
                  address: tokenAddr,
                  symbol: 'UNKNOWN',
                  balance: tokenBalance ? formatEther(tokenBalance as bigint) : '0',
                  decimals: 18
                };
                processedTokens.push(fallbackToken);
                console.log(`⚠️ Token fallback:`, fallbackToken);
              }
            } catch (error) {
              console.error(`❌ Error fetching metadata for token ${tokenAddr}:`, error);
              // Fallback on error
              const errorToken = {
                address: tokenAddr,
                symbol: 'UNKNOWN',
                balance: tokenBalance ? formatEther(tokenBalance as bigint) : '0',
                decimals: 18
              };
              processedTokens.push(errorToken);
              console.log(`❌ Token error fallback:`, errorToken);
            }
          }
          
          console.log('✅ Final processed vault tokens:', processedTokens);
          setVaultTokens(processedTokens);
        };
        
        processVaultTokens();
      } else {
        console.log('❌ Vault tokens data structure invalid:', { tokenAddresses, tokenBalances });
        setVaultTokens([]);
      }
    } else {
      // No vault tokens data available
      setVaultTokens([]);
      console.log('ℹ️ No vault tokens data available');
    }
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
      console.log('🧪 Manual token fetching test...');
      console.log('📍 Current address:', address);
      console.log('🔑 Alchemy API key:', WEB3_CONFIG.ALCHEMY_API_KEY);
      console.log('🌐 API URL:', `https://eth-sepolia.g.alchemy.com/v2/${WEB3_CONFIG.ALCHEMY_API_KEY}`);
      
      if (address) {
        fetchWalletTokens();
      } else {
        console.log('❌ No wallet address available');
      }
    };

    // Add vault tokens test function
    (window as any).testVaultTokens = () => {
      console.log('🧪 Manual vault tokens test...');
      console.log('📍 Current address:', address);
      console.log('🏦 Vault contract address:', WEB3_CONFIG.CROSSCHAINBANK_ADDRESS);
      console.log('📊 Current vault tokens data:', vaultTokensData);
      console.log('🪙 Current vault tokens state:', vaultTokens);
      
      if (address) {
        console.log('🔄 Manually calling fetchVaultTokensSigned...');
        fetchVaultTokensSigned();
      } else {
        console.log('❌ No wallet address available');
      }
    };

    console.log('🧪 Token fetching test function available: window.testTokenFetching()');
    console.log('🧪 Vault tokens test function available: window.testVaultTokens()');

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
      // SIMULATION: Check if user has enough balance before proceeding
      setIsSimulating(true);
      
      const amountInWei = parseEther(amount);
      const feeInWei = currentFee ? (currentFee as bigint) : 0n;
      const totalValue = amountInWei + feeInWei;
      
      console.log('🔍 Deposit Simulation:', {
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
        console.log('❌ Insufficient wallet balance for deposit:', { required, available });
        toast({
          title: "Insufficient Balance",
          description: `You need ${required} ETH (${amount} + ${formatEther(feeInWei)} fee). You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      console.log('✅ Deposit simulation successful, proceeding with transaction');
      
      // Simulation successful - proceed with transaction
      setIsSimulating(false);
      setIsLoading(true);
      
      console.log('Depositing ETH:', { 
        amount, 
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString(),
        totalValue: totalValue.toString()
      });
      
      // Call the real contract - send amount + fee together
      writeVaultContract({
        address: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
        abi: VAULT_ABI as any,
        functionName: 'depositETH',
        args: [],
        value: totalValue, // Send amount + fee together
        chain: sepolia,
        account: address,
      });

      toast({
        title: "Deposit Initiated",
        description: `Depositing ${amount} ETH + ${formatEther(feeInWei)} ETH fee to vault...`,
      });
      
    } catch (error) {
      console.error('Deposit error:', error);
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
      // SIMULATION: Check if user has enough vault balance before proceeding
      setIsSimulating(true);
      
      const amountInWei = parseEther(amount);
      const feeInWei = currentFee ? (currentFee as bigint) : 0n;
      
      console.log('🔍 Withdrawal Simulation:', {
        amount,
        amountInWei: amountInWei.toString(),
        vaultBalanceData: vaultBalanceData ? (vaultBalanceData as bigint).toString() : 'null',
        feeInWei: feeInWei.toString(),
        walletBalance: walletBalance ? walletBalance.value.toString() : 'null'
      });
      
      // Check if user has enough ETH in vault for withdrawal
      if ((vaultBalanceData as bigint) < amountInWei) {
        const available = formatEther(vaultBalanceData as bigint);
        console.log('❌ Insufficient vault balance:', { available, requested: amount });
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
        const feeRequired = formatEther(feeInWei);
        const available = formatEther(walletBalance.value);
        console.log('❌ Insufficient wallet balance for fee:', { feeRequired, available });
        toast({
          title: "Insufficient Balance for Fee",
          description: `You need ${feeRequired} ETH for the withdrawal fee. You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      console.log('✅ Withdrawal simulation successful, proceeding with transaction');
      
      // Simulation successful - proceed with transaction
      setIsSimulating(false);
      setIsLoading(true);
      
      console.log('Withdrawing ETH:', { 
        amount, 
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString()
      });
      
      // Call the real contract - send fee with withdrawal
      writeVaultContract({
        address: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
        abi: VAULT_ABI as any,
        functionName: 'withdrawETH',
        args: [amountInWei],
        value: feeInWei, // Send fee with withdrawal transaction
        chain: sepolia,
        account: address,
      });

      toast({
        title: "Withdrawal Initiated",
        description: `Withdrawing ${amount} ETH (fee: ${formatEther(feeInWei)} ETH)...`,
      });
      
    } catch (error) {
      console.error('Withdrawal error:', error);
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
      
      console.log('🔍 Transfer Simulation:', {
        to,
        amount,
        amountInWei: amountInWei.toString(),
        vaultBalanceData: vaultBalanceData ? (vaultBalanceData as bigint).toString() : 'null',
        feeInWei: feeInWei.toString(),
        walletBalance: walletBalance ? walletBalance.value.toString() : 'null'
      });
      
      // Check if user has enough ETH in vault for transfer
      if ((vaultBalanceData as bigint) < amountInWei) {
        const available = formatEther(vaultBalanceData as bigint);
        console.log('❌ Insufficient vault balance for transfer:', { available, requested: amount });
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
        const feeRequired = formatEther(feeInWei);
        const available = formatEther(walletBalance.value);
        console.log('❌ Insufficient wallet balance for transfer fee:', { feeRequired, available });
        toast({
          title: "Insufficient Balance for Fee",
          description: `You need ${feeRequired} ETH for the transfer fee. You have ${available} ETH.`,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }
      
      console.log('✅ Transfer simulation successful, proceeding with transaction');
      
      // Simulation successful - proceed with transaction
      setIsSimulating(false);
      setIsLoading(true);
      
      console.log('Transferring ETH:', { 
        to, 
        amount, 
        amountInWei: amountInWei.toString(),
        feeInWei: feeInWei.toString()
      });
      
      // Call the real contract for anonymous transfer - send fee with transfer
      writeVaultContract({
        address: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
        abi: VAULT_ABI as any,
        functionName: 'transferInternalETH',
        args: [to as `0x${string}`, amountInWei],
        value: feeInWei, // Send fee with transfer transaction
        chain: sepolia,
        account: address,
      });

      toast({
        title: "Transfer Initiated",
        description: `Transferring ${amount} ETH to ${to.slice(0, 6)}...${to.slice(-4)} (fee: ${formatEther(feeInWei)} ETH)`,
      });
      
    } catch (error) {
      console.error('Transfer error:', error);
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
      console.log(`🔐 Approving token ${tokenAddress} for amount ${amount}`);
      
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
          WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
          amount
        ],
        chain: sepolia,
        account: address,
      });

      console.log(`✅ Token approval transaction sent: ${approvalResult}`);
      return true;
      
    } catch (error) {
      console.error('❌ Token approval error:', error);
      toast({
        title: "Error",
        description: "Failed to approve token",
        variant: "destructive",
      });
      return false;
    }
  };

  // Extended deposit function for tokens
  const depositToken = async (tokenAddress: string, amount: bigint, tokenSymbol: string) => {
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
      console.log(`💰 Depositing ${amount} of ${tokenSymbol} to vault`);

      // First approve the token
      const approved = await approveToken(tokenAddress, amount);
      if (!approved) {
        setIsLoading(false);
        return;
      }

      // Then deposit to vault (this would call your vault contract)
      console.log(`✅ Token approved, proceeding with deposit...`);
      
      // Get current fee for the transaction
      if (!currentFee) {
        throw new Error('Current fee not available');
      }
      
      const feeWei = currentFee as bigint;
      console.log(`💰 Current fee: ${feeWei} wei (${formatEther(feeWei)} ETH)`);
      
      // Call the actual vault deposit function WITH ETH fee
      await writeVaultContract({
        address: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'depositToken',
        args: [tokenAddress, amount],
        chain: sepolia,
        account: address,
        value: feeWei, // Send ETH fee along with token deposit
      });
      
      console.log(`📝 Token deposit transaction initiated with ETH fee`);
      
      toast({
        title: "Token Deposit Initiated",
        description: `Depositing ${formatEther(amount)} ${tokenSymbol} + ${formatEther(feeWei)} ETH fee to vault...`,
      });
      
      // DON'T refresh here - let the transaction confirmation system handle it
      // This matches the ETH deposit flow exactly
      
      // DON'T set isLoading(false) here - let the transaction confirmation system handle it
      // This matches the ETH deposit flow exactly
      
    } catch (error) {
      console.error('❌ Token deposit error:', error);
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
  const depositTokenSmart = async (tokenAddress: string, amount: bigint, tokenSymbol: string) => {
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
      console.log(`🧠 Smart deposit for ${formatEther(amount)} ${tokenSymbol}`);

      // Step 1: Check current allowance
      console.log(`🔍 Checking current allowance for ${tokenSymbol}...`);
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
        args: [address, WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`],
      });

      console.log(`📊 Current allowance: ${currentAllowance}, Required: ${amount}`);

      // Step 2: Check if approval is needed
      if ((currentAllowance as bigint) >= amount) {
        console.log(`✅ Sufficient allowance (${currentAllowance}), proceeding directly to deposit`);
        // Skip approval, go straight to deposit
        await executeTokenDeposit(tokenAddress, amount, tokenSymbol);
      } else {
        console.log(`❌ Insufficient allowance (${currentAllowance} < ${amount}), approval needed`);
        // Need approval first, then auto-deposit after confirmation
        await executeTokenApprovalAndDeposit(tokenAddress, amount, tokenSymbol);
      }

    } catch (error) {
      console.error('❌ Smart token deposit error:', error);
      toast({
        title: "Error",
        description: `Failed to deposit ${tokenSymbol}`,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // SIMPLE APPROACH: 3-second delay between approval and deposit
  const depositTokenWithDelay = async (tokenAddress: string, amount: bigint, tokenSymbol: string) => {
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
      console.log(`⏱️ Deposit with 3-second delay for ${formatEther(amount)} ${tokenSymbol}`);

      // Step 1: Send approval transaction
      console.log(`🔐 Sending approval transaction for ${tokenSymbol}...`);
      
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
          WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
          amount
        ],
        chain: sepolia,
        account: address,
      });

      console.log(`✅ Approval transaction sent, waiting 3 seconds...`);
      
      toast({
        title: "Token Approval Sent",
        description: `Approving ${formatEther(amount)} ${tokenSymbol} for vault...`,
      });

      // Step 2: Wait 3 seconds then send deposit
      setTimeout(async () => {
        try {
          console.log(`⏰ 3 seconds elapsed, sending deposit transaction for ${tokenSymbol}...`);
          
          // Get current fee for the transaction
          if (!currentFee) {
            throw new Error('Current fee not available');
          }
          
          const feeWei = currentFee as bigint;
          console.log(`💰 Current fee: ${feeWei} wei (${formatEther(feeWei)} ETH)`);
          
          // Send the deposit transaction
          await writeVaultContract({
            address: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
            abi: VAULT_ABI,
            functionName: 'depositToken',
            args: [tokenAddress, amount],
            chain: sepolia,
            account: address,
            value: feeWei, // Send ETH fee along with token deposit
          });
          
          console.log(`📝 Deposit transaction sent with ETH fee`);
          
          toast({
            title: "Token Deposit Sent",
            description: `Depositing ${formatEther(amount)} ${tokenSymbol} + ${formatEther(feeWei)} ETH fee to vault...`,
          });
          
          // DON'T refresh here - let the transaction confirmation system handle it
          // DON'T set isLoading(false) here - let the transaction confirmation system handle it
          
        } catch (error) {
          console.error('❌ Deposit transaction error:', error);
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
      console.error('❌ Approval transaction error:', error);
      toast({
        title: "Approval Failed",
        description: `Failed to approve ${tokenSymbol}`,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // Helper: Execute token deposit (when allowance is sufficient)
  const executeTokenDeposit = async (tokenAddress: string, amount: bigint, tokenSymbol: string) => {
    try {
      console.log(`🚀 Executing direct deposit for ${tokenSymbol}...`);
      
      // Get current fee for the transaction
      if (!currentFee) {
        throw new Error('Current fee not available');
      }
      
      const feeWei = currentFee as bigint;
      console.log(`💰 Current fee: ${feeWei} wei (${formatEther(feeWei)} ETH)`);
      
      // Call the actual vault deposit function WITH ETH fee
      await writeVaultContract({
        address: WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
        abi: VAULT_ABI,
        functionName: 'depositToken',
        args: [tokenAddress, amount],
        chain: sepolia,
        account: address,
        value: feeWei, // Send ETH fee along with token deposit
      });
      
      console.log(`📝 Direct token deposit transaction initiated with ETH fee`);
      
      toast({
        title: "Token Deposit Initiated",
        description: `Depositing ${formatEther(amount)} ${tokenSymbol} + ${formatEther(feeWei)} ETH fee to vault...`,
      });
      
      // DON'T refresh here - let the transaction confirmation system handle it
      // DON'T set isLoading(false) here - let the transaction confirmation system handle it
      
    } catch (error) {
      console.error('❌ Direct token deposit error:', error);
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
      console.log(`🔐 Executing approval + auto-deposit for ${tokenSymbol}...`);
      
      // Step 1: Send approval transaction
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
          WEB3_CONFIG.CROSSCHAINBANK_ADDRESS as `0x${string}`,
          amount
        ],
        chain: sepolia,
        account: address,
      });

      console.log(`✅ Approval transaction sent`);
      
      toast({
        title: "Token Approval Sent",
        description: `Approving ${formatEther(amount)} ${tokenSymbol} for vault...`,
      });

      // Step 2: Wait for approval confirmation
      console.log(`⏳ Waiting for approval confirmation...`);
      
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
      console.error('❌ Token approval error:', error);
      toast({
        title: "Error",
        description: `Failed to approve ${tokenSymbol}`,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // Handle transaction state changes
  React.useEffect(() => {
    if (isConfirmed && !hasRefreshedAfterConfirmation) {
      console.log('🔄 Transaction confirmed! Starting smart refetch...');
      
      // Set flag to prevent multiple refreshes
      setHasRefreshedAfterConfirmation(true);
      
      toast({
        title: "Transaction Confirmed!",
        description: "Your transaction has been confirmed on the blockchain",
      });
      setIsLoading(false);
      
      // Check if this was an approval transaction that should trigger auto-deposit
      if (pendingApprovalForDeposit) {
        console.log('🔐 Approval confirmed, automatically proceeding to deposit...');
        
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
      
      // Smart refetch ONLY after transaction confirmation
      // This updates balances without constant API polling
      console.log('📊 Refetching vault balance...');
      refetchVaultBalance();
      
      console.log('💰 Refetching wallet balance...');
      refetchWalletBalance();
      
      console.log('💸 Refetching current fee...');
      refetchFee();
      
      // NEW: Refresh token balances after transaction confirmation
      console.log('🪙 Refreshing token balances after confirmation...');
      console.log('🪙 Calling fetchWalletTokens...');
      fetchWalletTokens();
      console.log('🪙 Calling fetchVaultTokensSigned...');
      fetchVaultTokensSigned();
      console.log('🪙 Token refresh calls completed');
      
      console.log('✅ Smart refetch completed!');
    }
  }, [isConfirmed, hasRefreshedAfterConfirmation, toast, refetchVaultBalance, refetchWalletBalance, refetchFee, fetchWalletTokens, fetchVaultTokensSigned, pendingApprovalForDeposit, hash]);

  // FIX: Reset loading state when transaction is cancelled or fails
  React.useEffect(() => {
    if (!isWritePending && isLoading) {
      console.log('🔄 Transaction cancelled or failed, resetting loading state...');
      setIsLoading(false);
    }
  }, [isWritePending, isLoading]);

  // Reset refresh flag when new transaction starts
  React.useEffect(() => {
    if (isWritePending) {
      setHasRefreshedAfterConfirmation(false);
    }
  }, [isWritePending]);

  // Combined loading state
  const isTransactionLoading = isLoading || isWritePending || isConfirming;

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
    // Transaction status for UI feedback
    isPending: isWritePending,
    isConfirming,
    isConfirmed,
    hash,
    // Token detection data
    walletTokens,
    vaultTokens,
    isLoadingTokens,
    refetchWalletTokens: fetchWalletTokens,
    refetchVaultTokens,
  };
};