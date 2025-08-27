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
import { formatTokenBalance } from "@/lib/utils";

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
  approvalType: 'exact' | 'unlimited'; // User's choice for approval amount
}

interface MultiTokenDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableTokens: Token[];
  onDeposit: (deposits: { token: string; amount: string; approvalType: 'exact' | 'unlimited' }[]) => Promise<void>;
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

  // Use utility function for token-specific precision
  const formatBalance = (balance: number, decimals: number = 18): string => {
    return formatTokenBalance(balance, decimals);
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setDeposits([]);
      setSelectedToken(null);
    }
  }, [isOpen]);

  // Debug: Monitor deposits state changes
  useEffect(() => {
    console.log('📊 Deposits state changed:', {
      count: deposits.length,
      deposits: deposits.map(d => ({ symbol: d.token.symbol, address: d.token.address, amount: d.amount, isValid: d.isValid }))
    });
  }, [deposits]);

  const validateDeposit = (token: Token, amount: string): { isValid: boolean; error?: string } => {
    if (!amount || parseFloat(amount) <= 0) {
      return { isValid: false, error: "Amount must be greater than 0" };
    }

    if (parseFloat(amount) < parseFloat(MIN_DEPOSIT)) {
      return { isValid: false, error: `Minimum deposit is ${MIN_DEPOSIT}` };
    }

    const balance = parseFloat(token.balance);
    if (parseFloat(amount) > balance) {
      return { isValid: false, error: `Insufficient balance. Max: ${formatBalance(balance, token.decimals)}` };
    }

    return { isValid: true };
  };

  const validateTokenSelection = (token: Token): { isValid: boolean; error?: string } => {
    // Check for duplicate tokens only when selecting/adding
    const duplicateCount = deposits.filter(d => d.token.address === token.address).length;
    if (duplicateCount > 0) {
      return { isValid: false, error: "Token already added to deposit" };
    }
    return { isValid: true };
  };

  const addTokenToDeposit = (token: Token) => {
    console.log('➕ Adding token to deposit:', { symbol: token.symbol, address: token.address });
    console.log('📊 Current deposits count:', deposits.length);
    
    if (deposits.length >= MAX_TOKENS) {
      console.log('❌ Max tokens reached:', deposits.length);
      return;
    }

    // Check if token is already added
    const validation = validateTokenSelection(token);
    if (!validation.isValid) {
      console.log('❌ Token validation failed:', validation.error);
      return; // Don't add if validation fails
    }

    const newDeposit: DepositEntry = {
      token,
      amount: "",
      isValid: false,
      approvalType: 'exact' // Default to exact approval for security
    };

    console.log('✅ Adding new deposit:', { symbol: token.symbol, address: token.address });
    setDeposits(prev => {
      const newDeposits = [...prev, newDeposit];
      console.log('📊 Updated deposits array:', newDeposits.map(d => ({ symbol: d.token.symbol, address: d.token.address })));
      return newDeposits;
    });
    setSelectedToken(null);
  };

  const updateDepositAmount = (index: number, amount: string) => {
    console.log(`updateDepositAmount: index=${index}, amount="${amount}"`);
    setDeposits(prev => prev.map((deposit, i) => {
      if (i === index) {
        const validation = validateDeposit(deposit.token, amount);
        console.log(`Validating deposit for ${deposit.token.symbol}: amount=${amount}, valid=${validation.isValid}, error=${validation.error}`);
        const updatedDeposit = {
          ...deposit,
          amount,
          isValid: validation.isValid,
          error: validation.error
        };
        console.log('Updated deposit:', updatedDeposit);
        return updatedDeposit;
      }
      return deposit;
    }));
  };

  const removeDeposit = (index: number) => {
    setDeposits(prev => prev.filter((_, i) => i !== index));
  };



  const isFormValid = () => {
    console.log('🔍 Form validation check:', {
      depositsLength: deposits.length,
      deposits: deposits.map(d => ({ symbol: d.token.symbol, amount: d.amount, isValid: d.isValid }))
    });
    return deposits.length > 0 && deposits.every(d => d.isValid && d.amount);
  };

  const handleDeposit = () => {
    if (!isFormValid()) {
      console.log('❌ Form validation failed:', {
        depositsLength: deposits.length,
        deposits: deposits.map(d => ({ symbol: d.token.symbol, amount: d.amount, isValid: d.isValid }))
      });
      return;
    }

    setIsValidating(true);
    try {
      const depositData = deposits.map(d => ({
        token: d.token.address,
        amount: d.amount,
        approvalType: d.approvalType
      }));

      console.log('🚀 Sending deposit data to parent:', {
        count: depositData.length,
        data: depositData.map(d => ({ token: d.token, amount: d.amount }))
      });

      onDeposit(depositData);
      // Don't close modal immediately - let wagmi hooks handle transaction state
      setTimeout(() => {
        onClose();
        setIsValidating(false);
      }, 2000);
    } catch (error) {
      console.error("Deposit failed:", error);
      setIsValidating(false);
    }
  };

  // CRITICAL FIX: Include ETH/native tokens but handle them separately
  const availableTokensForSelection = availableTokens.filter(token =>
    // Include ETH/native token (0x0 address) - will be handled separately
    // Exclude already selected tokens
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

          {/* ETH Information Alert */}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertTriangle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>ETH Support:</strong> ETH deposits are now supported in multi-token operations. 
              ETH will be handled separately from ERC20 tokens for optimal compatibility.
            </AlertDescription>
          </Alert>

          {/* Selected Tokens */}
          {deposits.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">Selected Tokens ({deposits.length})</h3>
              <div className="space-y-2">
                {deposits.map((deposit, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="flex items-center space-x-2">
                          <div className="font-medium">{deposit.token.symbol}</div>
                          {deposit.token.address === '0x0000000000000000000000000000000000000000' && (
                            <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-300">
                              ETH
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            placeholder="Amount"
                            value={deposit.amount}
                            onChange={(e) => updateDepositAmount(index, e.target.value)}
                            className={`flex-1 ${!deposit.isValid && deposit.amount ? 'border-red-500' : ''}`}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateDepositAmount(index, deposit.token.balance)}
                            disabled={isLoading}
                            className="px-2 py-1 h-8 text-xs"
                          >
                            MAX
                          </Button>
                        </div>
                        <div className="text-sm text-gray-600">
                          Balance: {formatBalance(parseFloat(deposit.token.balance), deposit.token.decimals)} {deposit.token.symbol}
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

                    {/* Approval Type Selection - Skip for ETH */}
                    {deposit.token.address !== '0x0000000000000000000000000000000000000000' ? (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-sm font-medium text-gray-700 mb-2">Approval Type:</div>
                        <div className="flex gap-4">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`approval-${index}`}
                              value="exact"
                              checked={deposit.approvalType === 'exact'}
                              onChange={(e) => {
                                setDeposits(prev => prev.map((d, i) =>
                                  i === index ? { ...d, approvalType: e.target.value as 'exact' | 'unlimited' } : d
                                ));
                              }}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm">Exact amount only</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`approval-${index}`}
                              value="unlimited"
                              checked={deposit.approvalType === 'unlimited'}
                              onChange={(e) => {
                                setDeposits(prev => prev.map((d, i) =>
                                  i === index ? { ...d, approvalType: e.target.value as 'exact' | 'unlimited' } : d
                                ));
                              }}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm">Unlimited approval</span>
                          </label>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {deposit.approvalType === 'exact'
                            ? `Will approve exactly ${deposit.amount} ${deposit.token.symbol}`
                            : `Will approve unlimited ${deposit.token.symbol} (recommended for frequent use)`}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-xs text-blue-600 font-medium">
                          💡 ETH deposits don't require approval - they're sent directly
                        </div>
                      </div>
                    )}
                    {deposit.error && (
                      <div className="text-red-600 text-sm mt-2 flex items-center space-x-1">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{deposit.error}</span>
                      </div>
                    )}
                  </Card>
                ))}
              </div>


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
