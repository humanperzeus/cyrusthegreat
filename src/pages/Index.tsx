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
    depositToken
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

  // Handle token deposit from modal
  const handleTokenDepositFromModal = (tokenAddress: string, amount: string, tokenSymbol: string) => {
    // Convert amount to bigint and call the actual deposit function
    const amountBigInt = parseEther(amount);
    depositToken(tokenAddress, amountBigInt, tokenSymbol);
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
        onWithdraw={() => setWithdrawModalOpen(true)}
        onTransfer={() => setTransferModalOpen(true)}
        onTokenDeposit={handleTokenDeposit}
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
        isLoading={isLoading}
        vaultBalance={vaultBalance}
        currentFee={currentFee}
        isTransactionConfirmed={isConfirmed}
        isSimulating={isSimulating}
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
      />
    </>
  );
};

export default Index;
