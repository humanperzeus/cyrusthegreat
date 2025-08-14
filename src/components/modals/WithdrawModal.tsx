import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowUpDown, Loader2, Info } from "lucide-react";

interface WithdrawModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWithdraw: (amount: string) => void;
  isLoading: boolean;
  isSimulating?: boolean; // Add simulation state
  vaultBalance: string;
  currentFee?: string;
  isTransactionConfirmed?: boolean;
}

export const WithdrawModal = ({ 
  open, 
  onOpenChange, 
  onWithdraw, 
  isLoading, 
  isSimulating = false, // Add simulation state
  vaultBalance,
  currentFee = "0.00",
  isTransactionConfirmed = false
}: WithdrawModalProps) => {
  const [amount, setAmount] = useState("");

  // Auto-close modal after successful transaction
  useEffect(() => {
    if (isTransactionConfirmed && !isLoading) {
      // Wait a moment for user to see success message, then close
      const timer = setTimeout(() => {
        onOpenChange(false);
        setAmount(""); // Reset amount
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [isTransactionConfirmed, isLoading, onOpenChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount) {
      onWithdraw(amount);
      // Don't reset amount here - wait for transaction confirmation
    }
  };

  const setMaxAmount = () => {
    setAmount(vaultBalance);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-card border-vault-primary/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-foreground">
            <ArrowUpDown className="w-6 h-6 text-vault-success" />
            Withdraw from Vault
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-foreground">
              Amount (ETH)
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
              Available in vault: {vaultBalance} ETH
            </p>
          </div>

          {/* Fee Information */}
          {amount && !isNaN(Number(amount)) && (
            <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex justify-between text-sm">
                <span className="text-amber-700 dark:text-amber-300">You will receive:</span>
                <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">
                  {amount} ETH
                </span>
              </div>
              <div className="flex justify-between text-sm text-amber-600">
                <span>Fee (paid from wallet):</span>
                <span className="font-mono">{currentFee} ETH</span>
              </div>
            </div>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              You receive exactly {amount || "0"} ETH to your wallet. The fee is paid separately from your wallet balance.
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
              onClick={() => onWithdraw(amount)} 
              disabled={!amount || isLoading || isSimulating}
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
                  Withdrawing...
                </>
              ) : (
                'Withdraw'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};