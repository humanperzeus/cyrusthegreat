import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Info, Loader2, Coins, Zap } from "lucide-react";
import { getChainConfig } from "@/config/web3";
import { MultiTokenDepositModal } from "./MultiTokenDepositModal";
import { RateLimitStatusDisplay } from "../shared/RateLimitStatusDisplay";

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeposit: (amount: string) => void;
  onTokenDeposit?: (tokenAddress: string, amount: string, tokenSymbol: string) => void;
  onMultiTokenDeposit?: (deposits: { token: string; amount: string }[]) => Promise<void>;
  isLoading: boolean;
  isSimulating?: boolean;
  walletBalance: string;
  currentFee?: string;
  isTransactionConfirmed?: boolean;
  // Token-specific props
  isTokenDeposit?: boolean;
  tokenSymbol?: string;
  tokenAddress?: string;
  tokenBalance?: string;
  // Chain-aware props
  activeChain?: 'ETH' | 'BSC' | 'BASE';
  // Multi-token functionality
  availableTokens?: Array<{
    address: string;
    symbol: string;
    balance: string;
    decimals: number;
    isNative?: boolean;
  }>;
  rateLimitStatus?: {
    remaining: number;
    total: number;
    resetTime: number;
  };
}

export function DepositModal({
  open,
  onOpenChange,
  onDeposit,
  onTokenDeposit,
  onMultiTokenDeposit,
  isLoading,
  isSimulating = false,
  walletBalance,
  currentFee = "0.00",
  isTransactionConfirmed = false,
  isTokenDeposit,
  tokenSymbol,
  tokenAddress,
  tokenBalance,
  activeChain,
  availableTokens = [],
  rateLimitStatus
}: DepositModalProps) {
  const [amount, setAmount] = useState("");
  const [isMultiTokenMode, setIsMultiTokenMode] = useState(false);
  const [showMultiTokenModal, setShowMultiTokenModal] = useState(false);

  // Auto-close modal after successful transaction
  useEffect(() => {
    if (isTransactionConfirmed && !isLoading) {
      // Wait a moment for user to see success message, then close
      const timer = setTimeout(() => {
        onOpenChange(false);
        setAmount(""); // Reset amount
        setIsMultiTokenMode(false); // Reset multi-token mode
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isTransactionConfirmed, isLoading, onOpenChange]);

  // Reset multi-token mode when modal opens/closes
  useEffect(() => {
    if (!open) {
      setIsMultiTokenMode(false);
      setShowMultiTokenModal(false);
    }
  }, [open]);

  const handleMultiTokenDeposit = async (deposits: { token: string; amount: string; approvalType: 'exact' | 'unlimited' }[]) => {
    if (onMultiTokenDeposit) {
      await onMultiTokenDeposit(deposits);
    }
  };

  const handleDeposit = () => {
    if (amount && !isNaN(Number(amount))) {
      onDeposit(amount);
      // Don't reset amount here - wait for transaction confirmation
    }
  };

  const handleMaxDeposit = () => {
    // For fees added on top, we need to leave room for the fee
    const maxAmount = Math.max(0, Number(walletBalance) - Number(currentFee));
    setAmount(maxAmount.toFixed(6));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              {isTokenDeposit
                ? `Deposit ${tokenSymbol} to Vault`
                : `Deposit ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} to Vault`
              }
            </DialogTitle>

            {/* Multi-Token Toggle */}
            {onMultiTokenDeposit && availableTokens.length > 0 && (
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
          </div>

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
                : `(${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'})`
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
                  : `${walletBalance} ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}`
                }
              </span>
            </div>
            
            <div className="flex justify-between text-sm text-amber-600">
              <span>Deposit Amount:</span>
              <span className="font-mono">
                {amount || "0"} {isTokenDeposit 
                  ? tokenSymbol 
                  : (activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH')
                }
              </span>
            </div>
            
            {/* ETH Fee - Always shown for both ETH and token deposits */}
            <div className="flex justify-between text-sm text-amber-600">
              <span>{activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} Fee:</span>
              <span className="font-mono">{currentFee} {activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}</span>
            </div>
            
            {/* Total calculation - Different for ETH vs Token deposits */}
            {!isTokenDeposit && amount && !isNaN(Number(amount)) && (
              <div className="flex justify-between text-sm text-green-600 font-semibold">
                <span>Total {activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} to Send:</span>
                <span className="font-mono">
                  {(Number(amount) + Number(currentFee)).toFixed(6)} {activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}
                </span>
              </div>
            )}
            
            {/* For token deposits, show ETH fee requirement */}
            {isTokenDeposit && (
              <div className="flex justify-between text-sm text-green-600 font-semibold">
                <span>{activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} Fee Required:</span>
                <span className="font-mono">{currentFee} {activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}</span>
              </div>
            )}
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {isTokenDeposit 
                ? `You'll receive exactly ${amount || "0"} ${tokenSymbol} in the vault. ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} fee (${currentFee} ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}) is paid separately.`
                : `The fee is sent on top of your deposit. You'll receive exactly ${amount || "0"} ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} in the vault.`
              }
            </AlertDescription>
          </Alert>

          {/* Single Token Deposit Button */}
          {!isMultiTokenMode && (
            <Button
              onClick={() => {
                if (isTokenDeposit && tokenAddress && tokenSymbol && onTokenDeposit) {
                  onTokenDeposit(tokenAddress, amount, tokenSymbol);
                } else {
                  onDeposit(amount);
                }
              }}
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
                  : `Deposit ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}`
              )}
            </Button>
          )}

          {/* Multi-Token Deposit Button */}
          {isMultiTokenMode && (
            <Button
              onClick={() => setShowMultiTokenModal(true)}
              disabled={isLoading}
              className="w-full"
              variant="default"
            >
              <Coins className="h-4 w-4 mr-2" />
              Open Multi-Token Deposit
              <Badge variant="secondary" className="ml-2">
                {availableTokens.length} tokens
              </Badge>
            </Button>
          )}
        </div>
      </DialogContent>

      {/* Multi-Token Deposit Modal */}
      {showMultiTokenModal && onMultiTokenDeposit && (
        <MultiTokenDepositModal
          isOpen={showMultiTokenModal}
          onClose={() => setShowMultiTokenModal(false)}
          availableTokens={availableTokens}
          onDeposit={handleMultiTokenDeposit}
          isLoading={isLoading}
          rateLimitStatus={rateLimitStatus}
        />
      )}
    </Dialog>
  );
};