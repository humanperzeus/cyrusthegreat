import { useState, useEffect } from "react";
import { VaultCore } from "@/components/VaultCore";
import { DepositModal } from "@/components/modals/DepositModal";
import { WithdrawModal } from "@/components/modals/WithdrawModal";
import { TransferModal } from "@/components/modals/TransferModal";
import { useVault } from "@/hooks/useVault";
import { parseEther } from "viem";
import { debugLog } from "@/lib/utils";


const Index = () => {
  // Chain switching state with persistence
  const [activeChain, setActiveChain] = useState<'ETH' | 'BSC' | 'BASE'>(() => {
    // Try to restore from localStorage, fallback to ETH
    const saved = localStorage.getItem('cyrusthegreat-active-chain');
    return (saved as 'ETH' | 'BSC' | 'BASE') || 'ETH';
  });

  // Save chain preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cyrusthegreat-active-chain', activeChain);
    debugLog(`💾 Chain preference saved to localStorage: ${activeChain}`);
  }, [activeChain]);
  
  const {
    walletBalance,
    vaultBalance,
    currentFee,
    isLoading,
    depositETH,
    withdrawETH,
    transferETH,
    isConnected,
    isSimulating, // Add simulation state
    isConfirmed, // Add transaction confirmation state
    walletTokens,
    vaultTokens,
    isLoadingWalletTokens,
    isLoadingVaultTokens,
    isLoadingTokens, // Keep for backward compatibility
    refetchWalletTokens,
    refetchVaultTokens,
    depositToken,
    depositTokenWithDelay,
    withdrawToken,
    withdrawMultipleTokens, // NEW: Multi-token withdrawal function
    transferInternalToken, // Add transferInternalToken to the hook
    transferMultipleTokens, // NEW: Multi-token transfer function
    depositMultipleTokens, // NEW: Multi-token deposit function
    getRateLimitStatus, // NEW: Rate limit status function
    // Network switching functions
    currentNetwork,
    isSwitchingNetwork,
    autoSwitchNetwork
  } = useVault(activeChain);

  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  // Multi-token functionality state
  const [rateLimitStatus, setRateLimitStatus] = useState<{
    remaining: number;
    total: number;
    resetTime: number;
  } | null>(null);

  // Fetch rate limit status on component mount and when dependencies change
  useEffect(() => {
    const fetchRateLimitStatus = async () => {
      try {
        const status = await getRateLimitStatus();
        setRateLimitStatus(status);
      } catch (error) {
        console.error('Failed to fetch rate limit status:', error);
      }
    };

    if (isConnected && getRateLimitStatus) {
      fetchRateLimitStatus();
    }
  }, [isConnected, getRateLimitStatus, activeChain]);

  // State for token deposit modal
  const [tokenDepositInfo, setTokenDepositInfo] = useState<{
    symbol: string;
    address: string;
    balance: string;
  } | null>(null);

  // State for token withdraw modal
  const [tokenWithdrawInfo, setTokenWithdrawInfo] = useState<{
    symbol: string;
    address: string;
    balance: string;
  } | null>(null);

  // State for token transfer modal
  const [tokenTransferInfo, setTokenTransferInfo] = useState<{
    symbol: string;
    address: string;
    balance: string;
  } | null>(null);

  // Handle token deposit click
  const handleTokenDeposit = (token: { symbol: string; address: string; balance: string }) => {
    setTokenDepositInfo(token);
    setDepositModalOpen(true);
  };

  // Handle ETH deposit (reset token info)
  const handleETHDeposit = () => {
    setTokenDepositInfo(null);
    setDepositModalOpen(true);
  };

  // Handle ETH withdraw (reset token info)
  const handleETHWithdraw = () => {
    setTokenWithdrawInfo(null);
    setWithdrawModalOpen(true);
  };

  // Handle ETH transfer (reset token info)
  const handleETHTransfer = () => {
    setTokenTransferInfo(null);
    setTransferModalOpen(true);
  };

  // Handle token deposit from modal
  const handleTokenDepositFromModal = (tokenAddress: string, amount: string, tokenSymbol: string) => {
    // Call the simple delay deposit function with string amount (function handles decimals internally)
    depositTokenWithDelay(tokenAddress, amount, tokenSymbol);
  };

  // Handle multi-token deposit from modal
  const handleMultiTokenDepositFromModal = (deposits: { token: string; amount: string; approvalType: 'exact' | 'unlimited' }[]) => {
    console.log('handleMultiTokenDepositFromModal called with:', deposits);
    // Call the multi-token deposit function
    depositMultipleTokens(deposits);
  };

  // Handle token withdraw click
  const handleTokenWithdraw = (token: { symbol: string; address: string; balance: string }) => {
    setTokenWithdrawInfo(token);
    setWithdrawModalOpen(true);
  };

  // Handle token withdraw from modal
  const handleTokenWithdrawFromModal = (tokenAddress: string, amount: string, tokenSymbol: string) => {
    // Call the token withdraw function
    withdrawToken(tokenAddress, amount, tokenSymbol);
  };

  // Token transfer handler
  const handleTokenTransfer = (token: { symbol: string; address: string; balance: string }) => {
    setTokenTransferInfo({
      symbol: token.symbol,
      address: token.address,
      balance: token.balance
    });
    setTransferModalOpen(true);
  };

  // Token transfer from modal (for ETH compatibility - keeps existing logic)
  const handleTokenTransferFromModal = (to: string, amount: string) => {
    if (tokenTransferInfo) {
      transferInternalToken(tokenTransferInfo.address, to, amount, tokenTransferInfo.symbol);
    }
  };

  return (
    <>
      <VaultCore
        walletBalance={walletBalance}
        vaultBalance={vaultBalance}
        currentFee={currentFee}
        isLoading={isLoading}
        isSimulating={isSimulating}
        isTransactionConfirmed={isConfirmed}
        walletTokens={walletTokens}
        vaultTokens={vaultTokens}
        isLoadingWalletTokens={isLoadingWalletTokens}
        isLoadingVaultTokens={isLoadingVaultTokens}
        refetchWalletTokens={refetchWalletTokens}
        refetchVaultTokens={refetchVaultTokens}
        onDeposit={handleETHDeposit}
        onWithdraw={handleETHWithdraw}
        onTransfer={handleETHTransfer}
        onTokenDeposit={handleTokenDeposit}
        onTokenWithdraw={handleTokenWithdraw}
        onTokenTransfer={handleTokenTransfer}
        // Chain switching props
        activeChain={activeChain}
        setActiveChain={setActiveChain}
      />

      <DepositModal
        open={depositModalOpen}
        onOpenChange={setDepositModalOpen}
        onDeposit={depositETH}
        onTokenDeposit={handleTokenDepositFromModal}
        onMultiTokenDeposit={handleMultiTokenDepositFromModal}
        isLoading={isLoading}
        isSimulating={isSimulating}
        walletBalance={walletBalance}
        currentFee={currentFee}
        isTransactionConfirmed={isConfirmed}
        // Token-specific props
        isTokenDeposit={!!tokenDepositInfo}
        tokenSymbol={tokenDepositInfo?.symbol}
        tokenAddress={tokenDepositInfo?.address}
        tokenBalance={tokenDepositInfo?.balance}
        // Chain-aware props
        activeChain={activeChain}
        // Multi-token functionality
        availableTokens={walletTokens}
        rateLimitStatus={rateLimitStatus}
      />

      <WithdrawModal
        open={withdrawModalOpen}
        onOpenChange={setWithdrawModalOpen}
        onWithdraw={withdrawETH}
        onTokenWithdraw={handleTokenWithdrawFromModal}
        onMultiTokenWithdraw={withdrawMultipleTokens}
        isLoading={isLoading}
        vaultBalance={vaultBalance}
        currentFee={currentFee}
        isTransactionConfirmed={isConfirmed}
        isSimulating={isSimulating}
        isTokenWithdraw={!!tokenWithdrawInfo}
        tokenSymbol={tokenWithdrawInfo?.symbol}
        tokenAddress={tokenWithdrawInfo?.address}
        tokenBalance={tokenWithdrawInfo?.balance}
        // Chain-aware props
        activeChain={activeChain}
        // Multi-token functionality
        vaultTokens={vaultTokens}
        rateLimitStatus={rateLimitStatus}
      />

      <TransferModal
        open={transferModalOpen}
        onOpenChange={setTransferModalOpen}
        onTransfer={transferETH}
        isLoading={isLoading}
        vaultBalance={vaultBalance}
        currentFee={currentFee}
        isTransactionConfirmed={isConfirmed}
        isSimulating={isSimulating}
        onTokenTransfer={handleTokenTransferFromModal}
        isTokenTransfer={!!tokenTransferInfo}
        tokenSymbol={tokenTransferInfo?.symbol}
        tokenAddress={tokenTransferInfo?.address}
        tokenBalance={tokenTransferInfo?.balance}
        // Chain-aware props
        activeChain={activeChain}
        // Multi-token functionality
        onMultiTokenTransfer={transferMultipleTokens}
        vaultTokens={vaultTokens}
        rateLimitStatus={rateLimitStatus}
      />
    </>
  );
};

export default Index;
