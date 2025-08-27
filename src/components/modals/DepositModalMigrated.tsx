/**
 * DepositModalMigrated - Migrated version using new modular system
 * This shows how to migrate from monolithic useVault to modular hooks
 */

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Info, Loader2, Coins, Zap, RefreshCw } from "lucide-react";
import { getChainConfig } from "@/config/web3";
import { MultiTokenDepositModal } from "./MultiTokenDepositModal";
import { RateLimitStatusDisplay } from "../shared/RateLimitStatusDisplay";
import { useTransactionManagement } from "@/hooks/useTransactionManagement";
import { useBalanceManagement } from "@/hooks/useBalanceManagement";
import { useTokenManagement } from "@/hooks/useTokenManagement";
import { debugLog } from "@/lib/utils";

interface DepositModalMigratedProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chain: 'ETH' | 'BSC' | 'BASE';
  // Optional token-specific deposit
  isTokenDeposit?: boolean;
  tokenSymbol?: string;
  tokenAddress?: string;
  showRefreshButtons?: boolean;
  showMigrationInfo?: boolean;
}

export function DepositModalMigrated({
  open,
  onOpenChange,
  chain,
  isTokenDeposit = false,
  tokenSymbol,
  tokenAddress,
  showRefreshButtons = true,
  showMigrationInfo = true
}: DepositModalMigratedProps) {
  // Use the new modular hooks
  const transactionManager = useTransactionManagement(chain);
  const balanceManager = useBalanceManagement(chain);
  const tokenManager = useTokenManagement(chain);

  const [amount, setAmount] = useState("");
  const [isMultiTokenMode, setIsMultiTokenMode] = useState(false);
  const [showMultiTokenModal, setShowMultiTokenModal] = useState(false);

  // Debug logging for migration tracking
  debugLog(`🧱 DepositModalMigrated - Using modular system for ${chain} deposit`);

  // Get relevant data from modular hooks
  const {
    depositETH,
    depositToken,
    depositMultipleTokens,
    isLoading,
    isSimulating,
    isConfirmed,
    rateLimitStatus
  } = transactionManager;

  const {
    walletBalance,
    vaultBalance,
    currentFee,
    refetchWalletBalance,
    refetchVaultBalance
  } = balanceManager;

  const {
    walletTokens,
    refetchWalletTokens
  } = tokenManager;

  // CRITICAL FIX: Create combined available tokens list that includes ETH for multi-token operations
  const availableTokensForMultiToken = [
    // Add ETH as the first token if wallet has ETH balance
    ...(walletBalance && parseFloat(walletBalance) > 0 ? [{
      address: '0x0000000000000000000000000000000000000000',
      symbol: chain === 'ETH' ? 'ETH' : chain === 'BSC' ? 'BNB' : 'ETH',
      balance: walletBalance,
      decimals: 18,
      isNative: true
    }] : []),
    // Add all ERC20 tokens
    ...walletTokens
  ];

  // Get specific token balance if token deposit
  const tokenBalance = isTokenDeposit && tokenAddress
    ? walletTokens.find(t => t.address === tokenAddress)?.balance || "0"
    : "0";

  // Auto-close modal after successful transaction
  useEffect(() => {
    if (isConfirmed && !isLoading) {
      // Wait a moment for user to see success message, then close
      const timer = setTimeout(() => {
        onOpenChange(false);
        setAmount(""); // Reset amount
        setIsMultiTokenMode(false); // Reset multi-token mode
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isConfirmed, isLoading, onOpenChange]);

  // Reset multi-token mode when modal opens/closes
  useEffect(() => {
    if (!open) {
      setIsMultiTokenMode(false);
      setShowMultiTokenModal(false);
    }
  }, [open]);

  const handleMultiTokenDeposit = async (deposits: { token: string; amount: string; approvalType: 'exact' | 'unlimited' }[]) => {
    if (depositMultipleTokens) {
      await depositMultipleTokens(deposits);
    }
  };

  const handleDeposit = () => {
    if (amount && !isNaN(Number(amount))) {
      if (isTokenDeposit && tokenAddress && tokenSymbol && depositToken) {
        depositToken(tokenAddress, amount, tokenSymbol);
      } else if (depositETH) {
        depositETH(amount);
      }
      // Don't reset amount here - wait for transaction confirmation
    }
  };

  const handleMaxDeposit = () => {
    // For fees added on top, we need to leave room for the fee
    const maxAmount = Math.max(0, Number(walletBalance) - Number(currentFee));
    setAmount(maxAmount.toFixed(6));
  };

  const handleRefresh = () => {
    debugLog(`🔄 Manual refresh for ${chain} deposit modal`);
    refetchWalletBalance();
    refetchVaultBalance();
    refetchWalletTokens();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              {isTokenDeposit
                ? `Deposit ${tokenSymbol} to Vault`
                : `Deposit ${getChainConfig(chain).nativeCurrency.symbol} to Vault`
              }
            </DialogTitle>

            {/* Multi-Token Toggle - Only for token deposits */}
            {isTokenDeposit && depositMultipleTokens && walletTokens.length > 0 && (
              <Button
                variant={isMultiTokenMode ? "default" : "outline"}
                size="sm"
                onClick={() => setIsMultiTokenMode(!isMultiTokenMode)}
                className="flex items-center space-x-1"
              >
                <Coins className="h-4 w-4" />
                <span className="text-xs">{isMultiTokenMode ? 'Single' : 'Multi'}</span>
              </Button>
            )}

            {/* Refresh Button */}
            {showRefreshButtons && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="h-8 w-8 p-0 text-gray-600 hover:text-gray-800"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Migration Status Info */}
          {showMigrationInfo && (
            <div className="bg-green-50 dark:bg-green-950 p-2 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-green-800 dark:text-green-200">
                  ✅ Using New Modular Transaction System
                </span>
              </div>
            </div>
          )}

          {/* Rate Limit Status - Compact */}
          {rateLimitStatus && (
            <div className="flex justify-center mt-2">
              <RateLimitStatusDisplay
                rateLimitStatus={rateLimitStatus}
                compact={true}
                showWarnings={false}
              />
            </div>
          )}
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Token Contract Display for Token Deposits */}
          {isTokenDeposit && tokenAddress && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Token Contract</Label>
              <div className="flex items-center gap-2 p-2 bg-background/20 rounded border">
                <span className="text-xs font-mono text-foreground">
                  {tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => window.open(`https://sepolia.etherscan.io/address/${tokenAddress}`, '_blank')}
                >
                  🔗
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="amount">
              Amount {isTokenDeposit
                ? `(${tokenSymbol})`
                : `(${getChainConfig(chain).nativeCurrency.symbol})`
              }
            </Label>
            <div className="flex gap-2">
              <Input
                id="amount"
                type="number"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.001"
                min="0"
                max={isTokenDeposit ? tokenBalance : walletBalance}
                disabled={isLoading}
              />
              <Button
                variant="outline"
                onClick={isTokenDeposit ? () => setAmount(tokenBalance || "0") : handleMaxDeposit}
                disabled={isLoading}
              >
                Max
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Wallet Balance:</span>
              <span className="font-mono">
                {isTokenDeposit
                  ? `${tokenBalance} ${tokenSymbol}`
                  : `${walletBalance} ${getChainConfig(chain).nativeCurrency.symbol}`
                }
              </span>
            </div>

            <div className="flex justify-between text-sm text-amber-600">
              <span>Deposit Amount:</span>
              <span className="font-mono">
                {amount || "0"} {isTokenDeposit
                  ? tokenSymbol
                  : getChainConfig(chain).nativeCurrency.symbol
                }
              </span>
            </div>

            {/* ETH Fee - Always shown for both ETH and token deposits */}
            <div className="flex justify-between text-sm text-amber-600">
              <span>{getChainConfig(chain).nativeCurrency.symbol} Fee:</span>
              <span className="font-mono">{currentFee} {getChainConfig(chain).nativeCurrency.symbol}</span>
            </div>

            {/* Total calculation - Different for ETH vs Token deposits */}
            {!isTokenDeposit && amount && !isNaN(Number(amount)) && (
              <div className="flex justify-between text-sm text-green-600 font-semibold">
                <span>Total {getChainConfig(chain).nativeCurrency.symbol} to Send:</span>
                <span className="font-mono">
                  {(Number(amount) + Number(currentFee)).toFixed(18)} {getChainConfig(chain).nativeCurrency.symbol}
                </span>
              </div>
            )}

            {/* For token deposits, show ETH fee requirement */}
            {isTokenDeposit && (
              <div className="flex justify-between text-sm text-green-600 font-semibold">
                <span>{getChainConfig(chain).nativeCurrency.symbol} Fee Required:</span>
                <span className="font-mono">{currentFee} {getChainConfig(chain).nativeCurrency.symbol}</span>
              </div>
            )}
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {isTokenDeposit
                ? `You'll receive exactly ${amount || "0"} ${tokenSymbol} in the vault. ${getChainConfig(chain).nativeCurrency.symbol} fee (${currentFee} ${getChainConfig(chain).nativeCurrency.symbol}) is paid separately.`
                : `The fee is sent on top of your deposit. You'll receive exactly ${amount || "0"} ${getChainConfig(chain).nativeCurrency.symbol} in the vault.`
              }
            </AlertDescription>
          </Alert>

          {/* Single Token Deposit Button */}
          {!isMultiTokenMode && (
            <Button
              onClick={handleDeposit}
              disabled={isLoading || !amount || Number(amount) <= 0}
              className="w-full"
            >
              {isSimulating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Checking...
                </>
              ) : isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Depositing...
                </>
              ) : (
                isTokenDeposit
                  ? `Deposit ${tokenSymbol}`
                  : `Deposit ${getChainConfig(chain).nativeCurrency.symbol}`
              )}
            </Button>
          )}

          {/* Multi-Token Deposit Button */}
          {isMultiTokenMode && isTokenDeposit && (
            <Button
              onClick={() => setShowMultiTokenModal(true)}
              disabled={isLoading}
              className="w-full"
              variant="default"
            >
              <Coins className="h-4 w-4 mr-2" />
              Open Multi-Token Deposit
              <Badge variant="secondary" className="ml-2">
                {walletTokens.length} tokens
              </Badge>
            </Button>
          )}
        </div>

        {/* Migration Benefits */}
        {showMigrationInfo && (
          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
              🎯 Migration Benefits:
            </h4>
            <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
              <li>• ✅ <strong>Isolated transaction logic</strong> - changes here don't affect balance/token logic</li>
              <li>• ✅ <strong>Chain-specific delays</strong> - automatic finality delays for different chains</li>
              <li>• ✅ <strong>Automatic data fetching</strong> - no need to pass transaction data as props</li>
              <li>• ✅ <strong>Better error handling</strong> - modular error management per transaction type</li>
              <li>• ✅ <strong>Independent testing</strong> - can test transaction functionality separately</li>
              <li>• ✅ <strong>Enhanced UX</strong> - individual refresh buttons and better state management</li>
            </ul>
          </div>
        )}
      </DialogContent>

      {/* Multi-Token Deposit Modal */}
      {showMultiTokenModal && depositMultipleTokens && isTokenDeposit && (
        <MultiTokenDepositModal
          isOpen={showMultiTokenModal}
          onClose={() => setShowMultiTokenModal(false)}
          availableTokens={availableTokensForMultiToken}
          onDeposit={handleMultiTokenDeposit}
          isLoading={isLoading}
          rateLimitStatus={rateLimitStatus}
        />
      )}
    </Dialog>
  );
}
