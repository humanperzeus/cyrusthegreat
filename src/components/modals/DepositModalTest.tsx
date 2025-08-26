/**
 * DepositModalTest - Simple test component to verify DepositModal migration works
 * This component tests both the old and new DepositModal components
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DepositModal } from "./DepositModal";
import { DepositModalMigrated } from "./DepositModalMigrated";

export function DepositModalTest() {
  const [showOld, setShowOld] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Mock data for testing (similar to what would come from useVault)
  const mockData = {
    walletBalance: "5.0",
    currentFee: "0.001",
    isLoading: false,
    isSimulating: false,
    isConfirmed: false,
    walletTokens: [
      {
        address: "0x1234567890123456789012345678901234567890",
        symbol: "USDT",
        balance: "100.50",
        decimals: 6
      },
      {
        address: "0x0987654321098765432109876543210987654321",
        symbol: "USDC",
        balance: "250.75",
        decimals: 6
      },
      {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "ETH",
        balance: "2.5",
        decimals: 18
      }
    ],
    rateLimitStatus: {
      remaining: 95,
      total: 100,
      resetTime: Date.now() + 3600000
    }
  };

  const handleDeposit = (amount: string) => {
    console.log('ETH Deposit:', amount);
    alert(`Depositing ${amount} ETH (mock)`);
  };

  const handleTokenDeposit = (tokenAddress: string, amount: string, tokenSymbol: string) => {
    console.log('Token Deposit:', { tokenAddress, amount, tokenSymbol });
    alert(`Depositing ${amount} ${tokenSymbol} (mock)`);
  };

  const handleMultiTokenDeposit = (deposits: { token: string; amount: string; approvalType: 'exact' | 'unlimited' }[]) => {
    console.log('Multi-Token Deposit:', deposits);
    alert(`Multi-token deposit: ${deposits.length} tokens (mock)`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">DepositModal Migration Test</h2>
        <div className="flex gap-4 justify-center mb-4">
          <Button
            variant={!showOld ? "default" : "outline"}
            onClick={() => setShowOld(false)}
          >
            Show New (Migrated)
          </Button>
          <Button
            variant={showOld ? "default" : "outline"}
            onClick={() => setShowOld(true)}
          >
            Show Old (Original)
          </Button>
        </div>

        <Button onClick={() => setIsModalOpen(true)} className="mb-4">
          Open Deposit Modal
        </Button>
      </div>

      {/* Old Modal */}
      {showOld && isModalOpen && (
        <DepositModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          onDeposit={handleDeposit}
          onTokenDeposit={handleTokenDeposit}
          onMultiTokenDeposit={handleMultiTokenDeposit}
          isLoading={mockData.isLoading}
          isSimulating={mockData.isSimulating}
          walletBalance={mockData.walletBalance}
          currentFee={mockData.currentFee}
          isTransactionConfirmed={mockData.isConfirmed}
          isTokenDeposit={false}
          tokenSymbol="USDT"
          tokenAddress="0x1234567890123456789012345678901234567890"
          tokenBalance="100.50"
          activeChain="ETH"
          availableTokens={mockData.walletTokens}
          rateLimitStatus={mockData.rateLimitStatus}
        />
      )}

      {/* New Modal */}
      {!showOld && isModalOpen && (
        <DepositModalMigrated
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          chain="ETH"
          isTokenDeposit={false}
          tokenSymbol="USDT"
          tokenAddress="0x1234567890123456789012345678901234567890"
          showRefreshButtons={true}
          showMigrationInfo={true}
        />
      )}

      <Card className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
        <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">DepositModal Migration Benefits:</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• ✅ <strong>Isolated transaction logic</strong> - changes here don't affect balance/token logic</li>
          <li>• ✅ <strong>Chain-specific delays</strong> - automatic finality delays for different chains</li>
          <li>• ✅ <strong>Automatic data fetching</strong> - no need to pass transaction data as props</li>
          <li>• ✅ <strong>Better error handling</strong> - modular error management per transaction type</li>
          <li>• ✅ <strong>Independent testing</strong> - can test transaction functionality separately</li>
          <li>• ✅ <strong>Enhanced UX</strong> - individual refresh buttons and better state management</li>
          <li>• ✅ <strong>Fewer props</strong> - simplified interface, less coupling to parent component</li>
        </ul>
      </Card>

      <Card className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
        <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Migration Comparison:</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h5 className="font-medium text-red-600 dark:text-red-400 mb-2">❌ Before (Monolithic):</h5>
            <ul className="text-red-600 dark:text-red-400 space-y-1">
              <li>• 15+ props from useVault hook</li>
              <li>• Tightly coupled to parent component</li>
              <li>• Complex prop management</li>
              <li>• Changes risk breaking other features</li>
              <li>• No independent data fetching</li>
              <li>• All-or-nothing approach</li>
            </ul>
          </div>
          <div>
            <h5 className="font-medium text-green-600 dark:text-green-400 mb-2">✅ After (Modular):</h5>
            <ul className="text-green-600 dark:text-green-400 space-y-1">
              <li>• 5-6 simple props</li>
              <li>• Independent data management</li>
              <li>• Clean, focused interface</li>
              <li>• Isolated, safe changes</li>
              <li>• Automatic data fetching</li>
              <li>• Chain-aware functionality</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
