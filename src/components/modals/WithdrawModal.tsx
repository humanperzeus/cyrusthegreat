import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowUpDown, Loader2, Info, Coins } from "lucide-react";
import { getChainConfig } from "@/config/web3";
import { MultiTokenWithdrawModal } from "./MultiTokenWithdrawModal";

interface WithdrawModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWithdraw: (amount: string) => void;
  onTokenWithdraw?: (tokenAddress: string, amount: string, tokenSymbol: string) => void;
  onMultiTokenWithdraw?: (withdrawals: { token: string; amount: string }[]) => Promise<void>;
  vaultBalance: string;
  currentFee?: string;
  isLoading: boolean;
  isSimulating?: boolean;
  isTransactionConfirmed?: boolean;
  // Token-specific props
  isTokenWithdraw?: boolean;
  tokenSymbol?: string;
  tokenAddress?: string;
  tokenBalance?: string;
  // Chain-aware props
  activeChain?: 'ETH' | 'BSC' | 'BASE';
  // Multi-token functionality
  vaultTokens?: Array<{address: string, symbol: string, balance: string, decimals: number}>;
  rateLimitStatus?: {
    remaining: number;
    total: number;
    resetTime: number;
  };
}

export function WithdrawModal({
  open,
  onOpenChange,
  onWithdraw,
  onTokenWithdraw,
  onMultiTokenWithdraw,
  vaultBalance,
  currentFee = "0.00",
  isLoading,
  isSimulating = false,
  isTransactionConfirmed = false,
  isTokenWithdraw,
  tokenSymbol,
  tokenAddress,
  tokenBalance,
  activeChain,
  vaultTokens = [],
  rateLimitStatus
}: WithdrawModalProps) {
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

  const handleMultiTokenWithdraw = async (withdrawals: { token: string; amount: string }[]) => {
    if (onMultiTokenWithdraw) {
      await onMultiTokenWithdraw(withdrawals);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount) {
      onWithdraw(amount);
      // Don't reset amount here - wait for transaction confirmation
    }
  };

  const setMaxAmount = () => {
    if (isTokenWithdraw && tokenBalance) {
      setAmount(tokenBalance);
    } else {
      setAmount(vaultBalance);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-card border-vault-primary/30">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-xl text-foreground">
              <ArrowUpDown className="w-6 h-6 text-vault-success" />
              {isTokenWithdraw
                ? `Withdraw ${tokenSymbol} from Vault`
                : `Withdraw ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} from Vault`
              }
            </DialogTitle>

            {/* Multi-Token Toggle */}
            {onMultiTokenWithdraw && vaultTokens.length > 0 && (
              <Button
                type="button"
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
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 py-4">
            {/* Token Contract Display for Token Withdrawals */}
            {isTokenWithdraw && tokenAddress && (
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
                Amount {isTokenWithdraw 
                  ? `(${tokenSymbol})` 
                  : `(${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'})`
                }
              </Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  step="0.000001"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-background/50 border-border text-foreground pr-16"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 px-2 text-xs"
                  onClick={setMaxAmount}
                  disabled={isLoading}
                >
                  MAX
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Available in vault: {isTokenWithdraw 
                  ? `${tokenBalance} ${tokenSymbol}` 
                  : `${vaultBalance} ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}`
                }
              </p>
            </div>

            {/* Fee Information */}
            {amount && !isNaN(Number(amount)) && (
              <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex justify-between text-sm">
                  <span className="text-amber-700 dark:text-amber-300">You will receive:</span>
                  <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">
                    {amount} {isTokenWithdraw 
                      ? tokenSymbol 
                      : (activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH')
                    }
                  </span>
                </div>
                <div className="flex justify-between text-sm text-amber-600">
                  <span>Fee (paid from wallet):</span>
                  <span className="font-mono">{currentFee} {activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}</span>
                </div>
              </div>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {isTokenWithdraw 
                  ? `You receive exactly ${amount || "0"} ${tokenSymbol} to your wallet. The ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} fee is paid separately from your wallet balance.`
                  : `You receive exactly ${amount || "0"} ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} to your wallet. The fee is paid separately from your wallet balance.`
                }
              </AlertDescription>
            </Alert>

            {/* Single Token Withdraw Button */}
            {!isMultiTokenMode && (
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (isTokenWithdraw && tokenAddress && tokenSymbol && onTokenWithdraw) {
                      onTokenWithdraw(tokenAddress, amount, tokenSymbol);
                    } else {
                      onWithdraw(amount);
                    }
                  }}
                  disabled={!amount || isLoading || isSimulating}
                  className="flex-1"
                >
                  {isSimulating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Checking...
                    </>
                  ) : isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Withdrawing...
                    </>
                  ) : (
                    isTokenWithdraw
                      ? `Withdraw ${tokenSymbol}`
                      : `Withdraw ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}`
                  )}
                </Button>
              </div>
            )}

            {/* Multi-Token Withdraw Button */}
            {isMultiTokenMode && (
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => setShowMultiTokenModal(true)}
                  disabled={isLoading}
                  className="flex-1"
                  variant="default"
                >
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  Open Multi-Token Withdraw
                  <span className="ml-2 text-xs bg-background/20 px-2 py-1 rounded">
                    {vaultTokens.length} tokens
                  </span>
                </Button>
              </div>
            )}
          </div>
        </form>
      </DialogContent>

      {/* Multi-Token Withdraw Modal */}
      {showMultiTokenModal && onMultiTokenWithdraw && (
        <MultiTokenWithdrawModal
          isOpen={showMultiTokenModal}
          onClose={() => setShowMultiTokenModal(false)}
          availableTokens={vaultTokens}
          onWithdraw={handleMultiTokenWithdraw}
          isLoading={isLoading}
          rateLimitStatus={rateLimitStatus}
        />
      )}
    </Dialog>
  );
};