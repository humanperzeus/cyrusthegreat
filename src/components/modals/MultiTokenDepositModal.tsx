/**
 * MultiTokenDepositModal - High Priority Feature
 * Allows users to deposit multiple tokens in a single transaction
 */

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { TokenList } from "../tokens/TokenList";

interface Token {
  address: string;
  symbol: string;
  balance: string;
  decimals: number;
  isNative?: boolean;
}

interface DepositEntry {
  token: Token;
  amount: string;
  isValid: boolean;
  error?: string;
}

interface MultiTokenDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableTokens: Token[];
  onDeposit: (deposits: { token: string; amount: string }[]) => Promise<void>;
  isLoading?: boolean;
  rateLimitStatus?: {
    remaining: number;
    total: number;
    resetTime: number;
  };
}

export function MultiTokenDepositModal({
  isOpen,
  onClose,
  availableTokens,
  onDeposit,
  isLoading = false,
  rateLimitStatus
}: MultiTokenDepositModalProps) {
  const [deposits, setDeposits] = useState<DepositEntry[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const MAX_TOKENS = 25; // CrossChainBank8 limit
  const MIN_DEPOSIT = "0.0001";

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setDeposits([]);
      setSelectedToken(null);
    }
  }, [isOpen]);

  const validateDeposit = (token: Token, amount: string): { isValid: boolean; error?: string } => {
    if (!amount || parseFloat(amount) <= 0) {
      return { isValid: false, error: "Amount must be greater than 0" };
    }

    if (parseFloat(amount) < parseFloat(MIN_DEPOSIT)) {
      return { isValid: false, error: `Minimum deposit is ${MIN_DEPOSIT}` };
    }

    const balance = parseFloat(token.balance);
    if (parseFloat(amount) > balance) {
      return { isValid: false, error: `Insufficient balance. Max: ${balance}` };
    }

    // Check for duplicate tokens
    const duplicateCount = deposits.filter(d => d.token.address === token.address).length;
    if (duplicateCount > 0) {
      return { isValid: false, error: "Token already added to deposit" };
    }

    return { isValid: true };
  };

  const addTokenToDeposit = (token: Token) => {
    if (deposits.length >= MAX_TOKENS) {
      return;
    }

    const newDeposit: DepositEntry = {
      token,
      amount: "",
      isValid: false
    };

    setDeposits(prev => [...prev, newDeposit]);
    setSelectedToken(null);
  };

  const updateDepositAmount = (index: number, amount: string) => {
    setDeposits(prev => prev.map((deposit, i) => {
      if (i === index) {
        const validation = validateDeposit(deposit.token, amount);
        return {
          ...deposit,
          amount,
          isValid: validation.isValid,
          error: validation.error
        };
      }
      return deposit;
    }));
  };

  const removeDeposit = (index: number) => {
    setDeposits(prev => prev.filter((_, i) => i !== index));
  };

  const getTotalValue = () => {
    return deposits.reduce((total, deposit) => {
      if (deposit.isValid && deposit.amount) {
        return total + parseFloat(deposit.amount);
      }
      return total;
    }, 0);
  };

  const isFormValid = () => {
    return deposits.length > 0 && deposits.every(d => d.isValid && d.amount);
  };

  const handleDeposit = async () => {
    if (!isFormValid()) return;

    setIsValidating(true);
    try {
      const depositData = deposits.map(d => ({
        token: d.token.address,
        amount: d.amount
      }));

      await onDeposit(depositData);
      onClose();
    } catch (error) {
      console.error("Deposit failed:", error);
    } finally {
      setIsValidating(false);
    }
  };

  const availableTokensForSelection = availableTokens.filter(token =>
    !deposits.some(d => d.token.address === token.address)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <span>Multi-Token Deposit</span>
            <Badge variant="secondary">{deposits.length}/{MAX_TOKENS}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Rate Limit Status */}
          {rateLimitStatus && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Rate Limit: {rateLimitStatus.remaining}/{rateLimitStatus.total} transactions remaining
                {rateLimitStatus.remaining === 0 && (
                  <span className="text-red-600 font-semibold">
                    (Resets in {Math.ceil(rateLimitStatus.resetTime / 1000)}s)
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Selected Tokens */}
          {deposits.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">Selected Tokens ({deposits.length})</h3>
              <div className="space-y-2">
                {deposits.map((deposit, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="font-medium">{deposit.token.symbol}</div>
                        <Input
                          type="number"
                          placeholder="Amount"
                          value={deposit.amount}
                          onChange={(e) => updateDepositAmount(index, e.target.value)}
                          className={`w-32 ${!deposit.isValid && deposit.amount ? 'border-red-500' : ''}`}
                        />
                        <div className="text-sm text-gray-600">
                          Balance: {parseFloat(deposit.token.balance).toFixed(4)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDeposit(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {deposit.error && (
                      <div className="text-red-600 text-sm mt-2 flex items-center space-x-1">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{deposit.error}</span>
                      </div>
                    )}
                  </Card>
                ))}
              </div>

              {/* Total Value */}
              <Card className="p-4 bg-blue-50">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Value:</span>
                  <span className="text-lg font-bold text-blue-600">
                    ${getTotalValue().toFixed(2)}
                  </span>
                </div>
              </Card>
            </div>
          )}

          {/* Add Token Section */}
          {deposits.length < MAX_TOKENS && (
            <div className="space-y-3">
              <h3 className="font-medium">Add Token to Deposit</h3>
              <TokenList
                tokens={availableTokensForSelection}
                onTokenSelect={addTokenToDeposit}
                selectedToken={selectedToken}
                onAddToken={addTokenToDeposit}
              />
            </div>
          )}

          {/* Validation Summary */}
          {deposits.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">Validation Summary</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  {deposits.every(d => d.isValid) ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="text-sm">
                    {deposits.filter(d => d.isValid).length}/{deposits.length} deposits valid
                  </span>
                </div>
                <Progress
                  value={(deposits.filter(d => d.isValid).length / deposits.length) * 100}
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between space-x-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={isLoading || isValidating}>
              Cancel
            </Button>
            <Button
              onClick={handleDeposit}
              disabled={!isFormValid() || isLoading || isValidating || (rateLimitStatus?.remaining === 0)}
            >
              {isValidating ? "Validating..." : isLoading ? "Depositing..." : `Deposit ${deposits.length} Tokens`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
