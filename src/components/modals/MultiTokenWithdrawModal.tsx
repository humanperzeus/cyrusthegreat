/**
 * MultiTokenWithdrawModal - Multi-Token Withdrawal Feature
 * Allows users to withdraw multiple tokens from vault in a single transaction
 */

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, AlertTriangle, CheckCircle, Clock, ArrowUpDown } from "lucide-react";
import { formatTokenBalance } from "@/lib/utils";

interface Token {
  address: string;
  symbol: string;
  balance: string;
  decimals: number;
  isNative?: boolean;
}

interface WithdrawEntry {
  token: Token;
  amount: string;
  isValid: boolean;
  error?: string;
}

interface MultiTokenWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableTokens: Token[];
  onWithdraw: (withdrawals: { token: string; amount: string }[]) => Promise<void>;
  isLoading?: boolean;
  rateLimitStatus?: {
    remaining: number;
    total: number;
    resetTime: number;
  };
}

export function MultiTokenWithdrawModal({
  isOpen,
  onClose,
  availableTokens,
  onWithdraw,
  isLoading = false,
  rateLimitStatus
}: MultiTokenWithdrawModalProps) {
  const [withdrawals, setWithdrawals] = useState<WithdrawEntry[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const MAX_TOKENS = 25; // CrossChainBank8 limit
  
  // CRITICAL FIX: Dynamic minimum withdrawal based on token decimals
  const getMinWithdraw = (decimals: number): string => {
    // For tokens with 6 decimals (like PYUSD), use 0.000001
    // For tokens with 18 decimals (like ETH), use 0.000000000000000001
    if (decimals <= 6) {
      return '0.000001'; // 6 decimal precision
    } else if (decimals <= 12) {
      return '0.000000001'; // 9 decimal precision
    } else {
      return '0.000000000000000001'; // 18 decimal precision
    }
  };

  // Use utility function for token-specific precision
  const formatBalance = (balance: number, decimals: number = 18): string => {
    return formatTokenBalance(balance, decimals);
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setWithdrawals([]);
      setSelectedToken(null);
    }
  }, [isOpen]);

  const validateWithdrawal = (token: Token, amount: string): { isValid: boolean; error?: string } => {
    if (!amount || parseFloat(amount) <= 0) {
      return { isValid: false, error: "Amount must be greater than 0" };
    }

    // CRITICAL FIX: Use dynamic minimum based on token decimals
    const minWithdraw = getMinWithdraw(token.decimals);
    if (parseFloat(amount) < parseFloat(minWithdraw)) {
      return { isValid: false, error: `Minimum withdrawal is ${minWithdraw} ${token.symbol}` };
    }

    const balance = parseFloat(token.balance);
    if (parseFloat(amount) > balance) {
      return { isValid: false, error: `Insufficient vault balance. Max: ${formatBalance(balance, token.decimals)}` };
    }

    return { isValid: true };
  };

  const validateTokenSelection = (token: Token): { isValid: boolean; error?: string } => {
    // Check for duplicate tokens only when selecting/adding
    const duplicateCount = withdrawals.filter(d => d.token.address === token.address).length;
    if (duplicateCount > 0) {
      return { isValid: false, error: "Token already added to withdrawal" };
    }
    return { isValid: true };
  };

  const addTokenToWithdrawal = (token: Token) => {
    if (withdrawals.length >= MAX_TOKENS) {
      return;
    }

    // Check if token is already added
    const validation = validateTokenSelection(token);
    if (!validation.isValid) {
      return; // Don't add if validation fails
    }

    const newWithdrawal: WithdrawEntry = {
      token,
      amount: "",
      isValid: false,
    };

    setWithdrawals(prev => [...prev, newWithdrawal]);
    setSelectedToken(null);
  };

  const updateWithdrawalAmount = (index: number, amount: string) => {
    console.log(`updateWithdrawalAmount: index=${index}, amount="${amount}"`);
    setWithdrawals(prev => prev.map((withdrawal, i) => {
      if (i === index) {
        const validation = validateWithdrawal(withdrawal.token, amount);
        console.log(`Validating withdrawal for ${withdrawal.token.symbol}: amount=${amount}, valid=${validation.isValid}, error=${validation.error}`);
        const updatedWithdrawal = {
          ...withdrawal,
          amount,
          isValid: validation.isValid,
          error: validation.error
        };
        console.log('Updated withdrawal:', updatedWithdrawal);
        return updatedWithdrawal;
      }
      return withdrawal;
    }));
  };

  const removeWithdrawal = (index: number) => {
    setWithdrawals(prev => prev.filter((_, i) => i !== index));
  };

  const isFormValid = () => {
    return withdrawals.length > 0 && withdrawals.every(d => d.isValid && d.amount);
  };

  const handleWithdraw = () => {
    if (!isFormValid()) {
      return;
    }

    setIsValidating(true);
    try {
      const withdrawalData = withdrawals.map(d => ({
        token: d.token.address,
        amount: d.amount
      }));

      onWithdraw(withdrawalData);
      // Don't close modal immediately - let wagmi hooks handle transaction state
      setTimeout(() => {
        onClose();
        setIsValidating(false);
      }, 2000);
    } catch (error) {
      console.error("Withdrawal failed:", error);
      setIsValidating(false);
    }
  };

  // Filter out ETH/native tokens and already selected tokens
  const availableTokensForSelection = availableTokens.filter(token =>
    // Exclude ETH/native token (0x0 address)
    token.address !== '0x0000000000000000000000000000000000000000' &&
    // Exclude already selected tokens
    !withdrawals.some(d => d.token.address === token.address)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <ArrowUpDown className="w-6 h-6 text-vault-success" />
            <span>Multi-Token Withdrawal</span>
            <Badge variant="secondary">{withdrawals.length}/{MAX_TOKENS}</Badge>
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
          {withdrawals.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">Selected Tokens ({withdrawals.length})</h3>
              <div className="space-y-2">
                {withdrawals.map((withdrawal, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="font-medium">{withdrawal.token.symbol}</div>
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            placeholder="Amount"
                            value={withdrawal.amount}
                            onChange={(e) => updateWithdrawalAmount(index, e.target.value)}
                            className={`flex-1 ${!withdrawal.isValid && withdrawal.amount ? 'border-red-500' : ''}`}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateWithdrawalAmount(index, withdrawal.token.balance)}
                            disabled={isLoading}
                            className="px-2 py-1 h-8 text-xs"
                          >
                            MAX
                          </Button>
                        </div>
                        <div className="text-sm text-gray-600">
                          Vault Balance: {formatBalance(parseFloat(withdrawal.token.balance), withdrawal.token.decimals)} {withdrawal.token.symbol}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeWithdrawal(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {withdrawal.error && (
                      <div className="text-red-600 text-sm mt-2 flex items-center space-x-1">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{withdrawal.error}</span>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Add Token Section */}
          {withdrawals.length < MAX_TOKENS && (
            <div className="space-y-3">
              <h3 className="font-medium">Add Token to Withdraw</h3>
              {/* We'll need to create a TokenList component or use the existing one */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {availableTokensForSelection.map((token, index) => (
                  <Card
                    key={index}
                    className="p-3 cursor-pointer hover:bg-background/40 transition-colors"
                    onClick={() => addTokenToWithdrawal(token)}
                  >
                    <div className="text-center space-y-2">
                      <div className="w-8 h-8 bg-vault-success/20 rounded-full flex items-center justify-center mx-auto">
                        <span className="text-sm font-medium text-vault-success">{token.symbol.charAt(0)}</span>
                      </div>
                      <div>
                        <div className="font-medium text-sm">{token.symbol}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatBalance(parseFloat(token.balance), token.decimals)} available
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              {availableTokensForSelection.length === 0 && withdrawals.length > 0 && (
                <div className="text-center p-4 text-muted-foreground">
                  All vault tokens have been added to withdrawal
                </div>
              )}
              {availableTokensForSelection.length === 0 && withdrawals.length === 0 && (
                <div className="text-center p-4 text-muted-foreground">
                  No tokens available in vault for withdrawal
                </div>
              )}
            </div>
          )}

          {/* Validation Summary */}
          {withdrawals.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">Validation Summary</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  {withdrawals.every(d => d.isValid) ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="text-sm">
                    {withdrawals.filter(d => d.isValid).length}/{withdrawals.length} withdrawals valid
                  </span>
                </div>
                <Progress
                  value={(withdrawals.filter(d => d.isValid).length / withdrawals.length) * 100}
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
              onClick={handleWithdraw}
              disabled={!isFormValid() || isLoading || isValidating || (rateLimitStatus?.remaining === 0)}
            >
              {isValidating ? "Validating..." : isLoading ? "Withdrawing..." : `Withdraw ${withdrawals.length} Tokens`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
