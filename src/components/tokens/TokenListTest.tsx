/**
 * TokenListTest - Simple test component to verify TokenList migration works
 * This component tests both the old and new TokenList components
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TokenList } from "./TokenList";
import { TokenListMigrated } from "./TokenListMigrated";

// Mock token data for testing
const mockTokens = [
  { address: "0x1234567890123456789012345678901234567890", symbol: "USDT", balance: "100.50", decimals: 6 },
  { address: "0x0987654321098765432109876543210987654321", symbol: "USDC", balance: "250.75", decimals: 6 },
  { address: "0x0000000000000000000000000000000000000000", symbol: "ETH", balance: "2.5", decimals: 18, isNative: true },
];

export function TokenListTest() {
  const [showOld, setShowOld] = useState(false);

  const handleTokenAction = (token: any) => {
    console.log(`Token action for ${token.symbol}:`, token);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">TokenList Migration Test</h2>
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
          <h3 className="text-lg font-semibold text-orange-600">🟡 Old TokenList (Monolithic)</h3>
          <TokenList
            tokens={mockTokens}
            onTokenSelect={handleTokenAction}
            isLoading={false}
          />
          <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              This component receives all tokens as props from the old useVault hook.
              It has no control over its own token fetching and relies on parent components.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-green-600">🟢 New TokenListMigrated (Modular)</h3>
          <TokenListMigrated
            chain="ETH"
            type="wallet"
            onTokenDeposit={handleTokenAction}
            onTokenWithdraw={handleTokenAction}
            onTokenTransfer={handleTokenAction}
            showRefreshButtons={true}
            showMigrationInfo={true}
          />
          <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-800 dark:text-green-200">
              This component manages its own token data using useTokenManagement.
              It has independent refresh controls and handles chain switching automatically.
            </p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
        <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">🎯 Migration Benefits:</h4>
        <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>• ✅ <strong>Independent Data</strong> - Manages own token fetching via useTokenManagement</li>
          <li>• ✅ <strong>Better Performance</strong> - Only loads token logic when needed</li>
          <li>• ✅ <strong>Isolated Changes</strong> - Token logic changes don't affect balance or transaction logic</li>
          <li>• ✅ <strong>Chain-Aware</strong> - Automatically handles chain switching and RPC URLs</li>
          <li>• ✅ <strong>Real-time Updates</strong> - Direct access to refresh functions with loading states</li>
          <li>• ✅ <strong>Enhanced UX</strong> - Individual refresh buttons and search functionality</li>
        </ul>
      </div>
    </div>
  );
}
