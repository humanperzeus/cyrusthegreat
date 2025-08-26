/**
 * BalanceDisplayMigrated - Migrated version using new modular system
 * This shows how to migrate from old useVault to new useBalanceManagement
 */

import { Card } from "@/components/ui/card";
import { Coins, Shield, RefreshCw } from "lucide-react";
import { getChainConfig } from "@/config/web3";
import { useBalanceManagement } from "@/hooks/useBalanceManagement";
import { Button } from "@/components/ui/button";
import { debugLog } from "@/lib/utils";

interface BalanceDisplayMigratedProps {
  chain: 'ETH' | 'BSC' | 'BASE';
  showRefreshButtons?: boolean; // Show individual refresh buttons
  showMigrationInfo?: boolean; // Show migration status info
}

export function BalanceDisplayMigrated({
  chain,
  showRefreshButtons = true,
  showMigrationInfo = true
}: BalanceDisplayMigratedProps) {
  // Use the new modular balance management hook
  const balanceManager = useBalanceManagement(chain);

  const {
    walletBalance,
    vaultBalance,
    isLoadingWalletBalance,
    isLoadingVaultBalance
  } = balanceManager;

  const chainConfig = getChainConfig(chain);
  const nativeSymbol = chainConfig.nativeCurrency.symbol;

  // Debug logging for migration tracking
  debugLog(`🧱 BalanceDisplayMigrated - Using modular balance system for ${chain}`);

  return (
    <div className="space-y-4">
      {/* Migration Status Info */}
      {showMigrationInfo && (
        <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              ✅ Using New Modular Balance System
            </span>
          </div>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
            This component is now using useBalanceManagement instead of the old useVault
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Wallet Balance */}
        <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Wallet Balance</p>
                {showRefreshButtons && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      debugLog('🔄 Manual wallet balance refresh');
                      balanceManager.refetchWalletBalance();
                    }}
                    className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {isLoadingWalletBalance ? '...' : walletBalance}
                </span>
                <span className="text-lg text-blue-600 dark:text-blue-400">{nativeSymbol}</span>
              </div>
            </div>
            <Coins className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
        </Card>

        {/* Vault Balance */}
        <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Vault Balance</p>
                {showRefreshButtons && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      debugLog('🔄 Manual vault balance refresh');
                      balanceManager.refetchVaultBalance();
                    }}
                    className="h-6 w-6 p-0 text-green-600 hover:text-green-800"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-green-900 dark:text-green-100">
                  {isLoadingVaultBalance ? '...' : vaultBalance}
                </span>
                <span className="text-lg text-green-600 dark:text-green-400">{nativeSymbol}</span>
              </div>
            </div>
            <Shield className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        </Card>
      </div>

      {/* Current Fee Display */}
      <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Current Fee</p>
              {showRefreshButtons && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    debugLog('🔄 Manual fee refresh');
                    balanceManager.refetchFee();
                  }}
                  className="h-6 w-6 p-0 text-purple-600 hover:text-purple-800"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-purple-900 dark:text-purple-100">
                {balanceManager.isLoadingFee ? '...' : balanceManager.currentFee}
              </span>
              <span className="text-sm text-purple-600 dark:text-purple-400">{nativeSymbol}</span>
            </div>
          </div>
          <div className="text-xs text-purple-600 dark:text-purple-400">
            Dynamic $0.10 fee
          </div>
        </div>
      </Card>

      {/* Migration Benefits */}
      {showMigrationInfo && (
        <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
            🎯 Migration Benefits:
          </h4>
          <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
            <li>• ✅ Isolated balance logic - changes here don't affect token or transaction logic</li>
            <li>• ✅ Better performance - only loads balance-related code</li>
            <li>• ✅ Easier testing - can test balance functionality independently</li>
            <li>• ✅ Clear responsibility - this component only handles balance display</li>
          </ul>
        </div>
      )}
    </div>
  );
}
