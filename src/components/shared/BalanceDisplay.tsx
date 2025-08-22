/**
 * BalanceDisplay - Focused component for displaying wallet and vault balances
 * This is extracted from the monolithic VaultCore component
 */

import { Card } from "@/components/ui/card";
import { Coins, Shield } from "lucide-react";
import { getChainConfig } from "@/config/web3";

interface BalanceDisplayProps {
  walletBalance: string;
  vaultBalance: string;
  chain: 'ETH' | 'BSC' | 'BASE';
  isLoading?: boolean;
}

export function BalanceDisplay({
  walletBalance,
  vaultBalance,
  chain,
  isLoading = false
}: BalanceDisplayProps) {
  const chainConfig = getChainConfig(chain);
  const nativeSymbol = chainConfig.nativeCurrency.symbol;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Wallet Balance */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Wallet Balance</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {isLoading ? '...' : walletBalance}
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
            <p className="text-sm font-medium text-green-600 dark:text-green-400">Vault Balance</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-green-900 dark:text-green-100">
                {isLoading ? '...' : vaultBalance}
              </span>
              <span className="text-lg text-green-600 dark:text-green-400">{nativeSymbol}</span>
            </div>
          </div>
          <Shield className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
      </Card>
    </div>
  );
}
