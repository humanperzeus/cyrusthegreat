import { useState } from "react";
import { VaultCore } from "@/components/VaultCore";
import { DepositModal } from "@/components/modals/DepositModal";
import { WithdrawModal } from "@/components/modals/WithdrawModal";
import { TransferModal } from "@/components/modals/TransferModal";
import { useVault } from "@/hooks/useVault";
import { parseEther } from "viem";

const Index = () => {
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
    isLoadingTokens,
    refetchWalletTokens,
    refetchVaultTokens,
    depositToken,
    depositTokenWithDelay,
    withdrawToken,
    transferInternalToken, // Add transferInternalToken to the hook
    // Network switching functions
    currentNetwork,
    isSwitchingNetwork,
    autoSwitchNetwork
  } = useVault();

  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  
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
        isLoadingTokens={isLoadingTokens}
        refetchWalletTokens={refetchWalletTokens}
        refetchVaultTokens={refetchVaultTokens}
        onDeposit={handleETHDeposit}
        onWithdraw={handleETHWithdraw}
        onTransfer={handleETHTransfer}
        onTokenDeposit={handleTokenDeposit}
        onTokenWithdraw={handleTokenWithdraw}
        onTokenTransfer={handleTokenTransfer}
      />

      <DepositModal
        open={depositModalOpen}
        onOpenChange={setDepositModalOpen}
        onDeposit={depositETH}
        onTokenDeposit={handleTokenDepositFromModal}
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
      />

      <WithdrawModal
        open={withdrawModalOpen}
        onOpenChange={setWithdrawModalOpen}
        onWithdraw={withdrawETH}
        onTokenWithdraw={handleTokenWithdrawFromModal}
        isLoading={isLoading}
        vaultBalance={vaultBalance}
        currentFee={currentFee}
        isTransactionConfirmed={isConfirmed}
        isSimulating={isSimulating}
        isTokenWithdraw={!!tokenWithdrawInfo}
        tokenSymbol={tokenWithdrawInfo?.symbol}
        tokenAddress={tokenWithdrawInfo?.address}
        tokenBalance={tokenWithdrawInfo?.balance}
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
      />
    </>
  );
};

export default Index;
