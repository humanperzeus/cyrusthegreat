import { useState } from "react";
import { VaultCore } from "@/components/VaultCore";
import { DepositModal } from "@/components/modals/DepositModal";
import { WithdrawModal } from "@/components/modals/WithdrawModal";
import { TransferModal } from "@/components/modals/TransferModal";
import { useVault } from "@/hooks/useVault";

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
    isConfirmed // Add transaction confirmation state
  } = useVault();

  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  return (
    <>
      <VaultCore
        walletBalance={walletBalance}
        vaultBalance={vaultBalance}
        currentFee={currentFee}
        onDeposit={() => setDepositModalOpen(true)}
        onWithdraw={() => setWithdrawModalOpen(true)}
        onTransfer={() => setTransferModalOpen(true)}
      />

      <DepositModal
        open={depositModalOpen}
        onOpenChange={setDepositModalOpen}
        onDeposit={depositETH}
        isLoading={isLoading}
        walletBalance={walletBalance}
        currentFee={currentFee}
        isTransactionConfirmed={isConfirmed}
        isSimulating={isSimulating}
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
