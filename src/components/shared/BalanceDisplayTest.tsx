/**
 * BalanceDisplayTest - Simple test component to verify migration works
 * This component tests both the old and new BalanceDisplay components
 */

import { BalanceDisplay } from "./BalanceDisplay";
import { BalanceDisplayMigrated } from "./BalanceDisplayMigrated";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BalanceDisplayTest() {
  const [showOld, setShowOld] = useState(false);

  // Mock data for testing
  const mockData = {
    walletBalance: "1.234567",
    vaultBalance: "5.678901",
    currentFee: "0.001234",
    chain: "ETH" as const,
    isLoading: false
  };

  return (
    <div className="p-6 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">BalanceDisplay Migration Test</h2>
        <div className="flex gap-4 justify-center">
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
      </div>

      {showOld ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-orange-600">🟡 Old BalanceDisplay (Monolithic)</h3>
          <BalanceDisplay
            walletBalance={mockData.walletBalance}
            vaultBalance={mockData.vaultBalance}
            chain={mockData.chain}
            isLoading={mockData.isLoading}
          />
          <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              This component receives all data as props from the old useVault hook.
              It has no control over its own data fetching.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-green-600">🟢 New BalanceDisplayMigrated (Modular)</h3>
          <BalanceDisplayMigrated
            chain={mockData.chain}
            showRefreshButtons={true}
            showMigrationInfo={true}
          />
          <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-800 dark:text-green-200">
              This component manages its own data using useBalanceManagement.
              It has independent refresh controls and better separation of concerns.
            </p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
        <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Migration Benefits:</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• ✅ Isolated balance logic - changes here don't affect token or transaction logic</li>
          <li>• ✅ Better performance - only loads balance-related code</li>
          <li>• ✅ Independent refresh - each balance type can be refreshed separately</li>
          <li>• ✅ Clear responsibility - this component only handles balance display</li>
          <li>• ✅ Easier testing - can test balance functionality independently</li>
          <li>• ✅ Chain-specific delays - handles fast chains (BASE) vs slow chains (ETH)</li>
        </ul>
      </div>
    </div>
  );
}
