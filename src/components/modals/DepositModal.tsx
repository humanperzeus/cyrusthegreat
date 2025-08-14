import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Loader2 } from "lucide-react";

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeposit: (amount: string) => void;
  isLoading: boolean;
  isSimulating?: boolean; // Add simulation state
  walletBalance: string;
  currentFee?: string;
  isTransactionConfirmed?: boolean; // Add this prop
}

export const DepositModal = ({ 
  open, 
  onOpenChange, 
  onDeposit, 
  isLoading, 
  isSimulating = false, // Add simulation state
  walletBalance,
  currentFee = "0.00",
  isTransactionConfirmed = false
}: DepositModalProps) => {
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
          <DialogTitle>Deposit ETH to Vault</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="amount">Amount (ETH)</Label>
            <div className="flex gap-2">
              <Input
                id="amount"
                type="number"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.001"
                min="0"
                max={walletBalance}
                disabled={isLoading}
              />
              <Button 
                variant="outline" 
                onClick={handleMaxDeposit}
                disabled={isLoading}
              >
                Max
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Wallet Balance:</span>
              <span className="font-mono">{walletBalance} ETH</span>
            </div>
            
            <div className="flex justify-between text-sm text-amber-600">
              <span>Deposit Amount:</span>
              <span className="font-mono">{amount || "0"} ETH</span>
            </div>
            
            <div className="flex justify-between text-sm text-amber-600">
              <span>Fee:</span>
              <span className="font-mono">{currentFee} ETH</span>
            </div>
            
            {amount && !isNaN(Number(amount)) && (
              <div className="flex justify-between text-sm text-green-600 font-semibold">
                <span>Total to Send:</span>
                <span className="font-mono">
                  {(Number(amount) + Number(currentFee)).toFixed(6)} ETH
                </span>
              </div>
            )}
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              The fee is sent on top of your deposit. You'll receive exactly {amount || "0"} ETH in the vault.
            </AlertDescription>
          </Alert>

          <Button 
            onClick={() => onDeposit(amount)} 
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
                Depositing...
              </>
            ) : (
              'Deposit ETH'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};