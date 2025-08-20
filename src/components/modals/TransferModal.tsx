import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowUpDown, Loader2, Shield, Info } from "lucide-react";
import { getChainConfig } from "@/config/web3";

interface TransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: (to: string, amount: string) => void;
  onTokenTransfer?: (to: string, amount: string) => void;
  vaultBalance: string;
  currentFee?: string;
  isLoading: boolean;
  isSimulating?: boolean;
  isTransactionConfirmed?: boolean;
  // Token-specific props
  isTokenTransfer?: boolean;
  tokenSymbol?: string;
  tokenAddress?: string;
  tokenBalance?: string;
  // Chain-aware props
  activeChain?: 'ETH' | 'BSC' | 'BASE';
}

export function TransferModal({
  open,
  onOpenChange,
  onTransfer,
  onTokenTransfer,
  vaultBalance,
  currentFee = "0.00",
  isLoading,
  isSimulating = false,
  isTransactionConfirmed = false,
  isTokenTransfer,
  tokenSymbol,
  tokenAddress,
  tokenBalance,
  activeChain
}: TransferModalProps) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  // Auto-close modal after successful transaction
  useEffect(() => {
    if (isTransactionConfirmed && !isLoading) {
      // Wait a moment for user to see success message, then close
      const timer = setTimeout(() => {
        onOpenChange(false);
        setTo(""); // Reset form
        setAmount("");
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [isTransactionConfirmed, isLoading, onOpenChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (to && amount) {
      onTransfer(to, amount);
      // Don't reset form here - wait for transaction confirmation
    }
  };

  const setMaxAmount = () => {
    if (isTokenTransfer && tokenBalance) {
      setAmount(tokenBalance);
    } else {
      setAmount(vaultBalance);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-card border-vault-secondary/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-foreground">
            <Shield className="w-6 h-6 text-vault-secondary" />
            {isTokenTransfer 
              ? `Anonymous ${tokenSymbol} Transfer` 
              : `Anonymous ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} Transfer`
            }
          </DialogTitle>
        </DialogHeader>
        
        <div className="bg-vault-secondary/10 border border-vault-secondary/20 rounded-lg p-4 mb-4">
          <p className="text-sm text-vault-secondary flex items-center gap-2">
            <Shield className="w-4 h-4" />
            This transfer is completely anonymous within the vault
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Token Contract Display for Token Transfers */}
          {isTokenTransfer && tokenAddress && (
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

          <div className="space-y-2">
            <Label htmlFor="to" className="text-foreground">
              Recipient Address
            </Label>
            <Input
              id="to"
              type="text"
              placeholder="0x..."
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-background/50 border-border text-foreground"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount" className="text-foreground">
              Amount {isTokenTransfer 
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
              Available in vault: {isTokenTransfer 
                ? `${tokenBalance} ${tokenSymbol}` 
                : `${vaultBalance} ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}`
              }
            </p>
          </div>

          {/* Fee Information */}
          {amount && !isNaN(Number(amount)) && (
            <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex justify-between text-sm">
                <span className="text-amber-700 dark:text-amber-300">Recipient receives:</span>
                <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">
                  {amount} {isTokenTransfer 
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
              {isTokenTransfer 
                ? `The recipient receives exactly ${amount || "0"} ${tokenSymbol}. The ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} fee is paid separately from your wallet balance.`
                : `The recipient receives exactly ${amount || "0"} ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}. The fee is paid separately from your wallet balance.`
              }
            </AlertDescription>
          </Alert>

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
                if (isTokenTransfer && onTokenTransfer) {
                  onTokenTransfer(to, amount);
                } else {
                  onTransfer(to, amount);
                }
              }} 
              disabled={!to || !amount || isLoading || isSimulating}
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
                  Transferring...
                </>
              ) : (
                isTokenTransfer 
                  ? `Transfer ${tokenSymbol}` 
                  : `Transfer ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}`
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};