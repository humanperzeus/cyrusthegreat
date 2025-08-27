/**
 * BatchTransactionPreview - High Priority Feature
 * Shows users a detailed preview of their multi-token batch transactions
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Zap,
  Shield
} from "lucide-react";
import { formatTokenBalance } from "@/lib/utils";

interface TokenTransaction {
  token: {
    address: string;
    symbol: string;
    decimals: number;
    isNative?: boolean;
  };
  amount: string;
  balance: string;
  valueUSD?: string;
}

interface BatchTransaction {
  type: 'deposit' | 'withdraw' | 'transfer';
  tokens: TokenTransaction[];
  recipient?: string;
  chain: 'ETH' | 'BSC' | 'BASE';
}

interface BatchTransactionPreviewProps {
  transaction: BatchTransaction | null;
  isVisible?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
  estimatedGas?: {
    cost: string;
    time: string;
    usdValue?: string;
  };
  warnings?: string[];
  errors?: string[];
}

export function BatchTransactionPreview({
  transaction,
  isVisible = true,
  onConfirm,
  onCancel,
  isLoading = false,
  estimatedGas,
  warnings = [],
  errors = []
}: BatchTransactionPreviewProps) {
  if (!isVisible || !transaction) {
    return null;
  }

  const getTransactionTitle = () => {
    switch (transaction.type) {
      case 'deposit':
        return `Multi-Token Deposit (${transaction.tokens.length} tokens)`;
      case 'withdraw':
        return `Multi-Token Withdrawal (${transaction.tokens.length} tokens)`;
      case 'transfer':
        return `Multi-Token Transfer (${transaction.tokens.length} tokens)`;
      default:
        return 'Batch Transaction';
    }
  };

  const getTotalValue = () => {
    return transaction.tokens.reduce((total, token) => {
      return total + (parseFloat(token.valueUSD || '0'));
    }, 0);
  };

  const hasInsufficientBalance = () => {
    return transaction.tokens.some(token => {
      const amount = parseFloat(token.amount);
      const balance = parseFloat(token.balance);
      return amount > balance;
    });
  };

  const hasErrors = errors.length > 0 || hasInsufficientBalance();
  const hasWarnings = warnings.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Eye className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-lg">{getTransactionTitle()}</h3>
          </div>
          <Badge variant="outline" className="text-xs">
            {transaction.chain} Network
          </Badge>
        </div>
      </Card>

      {/* Transaction Summary */}
      <Card className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">Total Value:</span>
            <span className="text-lg font-bold text-green-600">
              ${getTotalValue().toFixed(2)}
            </span>
          </div>

          {transaction.recipient && (
            <div className="flex items-center justify-between">
              <span className="font-medium">Recipient:</span>
              <span className="text-sm font-mono text-gray-600">
                {transaction.recipient.slice(0, 6)}...{transaction.recipient.slice(-4)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="font-medium">Tokens:</span>
            <span className="text-sm text-gray-600">
              {transaction.tokens.length} tokens
            </span>
          </div>
        </div>
      </Card>

      {/* Token Details */}
      <Card className="p-4">
        <h4 className="font-medium mb-3">Token Breakdown</h4>
        <ScrollArea className="max-h-64">
          <div className="space-y-3">
            {transaction.tokens.map((token, index) => {
              const amount = parseFloat(token.amount);
              const balance = parseFloat(token.balance);
              const hasInsufficient = amount > balance;
              const percentageOfBalance = balance > 0 ? (amount / balance) * 100 : 0;

              return (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="font-medium">{token.token.symbol}</div>
                    {token.token.isNative && (
                      <Badge variant="secondary" className="text-xs">Native</Badge>
                    )}
                  </div>

                  <div className="text-right">
                                      <div className={`font-mono ${hasInsufficient ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatTokenBalance(amount, token.token.decimals)} {token.token.symbol}
                  </div>
                  <div className="text-xs text-gray-600">
                    Balance: {formatTokenBalance(balance, token.token.decimals)} ({percentageOfBalance.toFixed(1)}%)
                  </div>
                    {token.valueUSD && (
                      <div className="text-xs text-green-600">
                        ≈ ${parseFloat(token.valueUSD).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </Card>

      {/* Gas Estimation */}
      {estimatedGas && (
        <Card className="p-4">
          <div className="flex items-center space-x-2 mb-3">
            <Zap className="h-4 w-4 text-blue-600" />
            <span className="font-medium">Gas Estimation</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Estimated Cost:</span>
              <div className="font-medium">{estimatedGas.cost}</div>
              {estimatedGas.usdValue && (
                <div className="text-xs text-gray-600">≈ ${estimatedGas.usdValue}</div>
              )}
            </div>
            <div>
              <span className="text-gray-600">Estimated Time:</span>
              <div className="font-medium">{estimatedGas.time}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Errors */}
      {hasErrors && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">Transaction cannot proceed:</div>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
                {hasInsufficientBalance() && (
                  <li>One or more tokens have insufficient balance</li>
                )}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {hasWarnings && !hasErrors && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">Please review:</div>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Security Notice */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-center space-x-2">
          <Shield className="h-4 w-4 text-blue-600" />
          <span className="font-medium text-blue-900">Security Notice</span>
        </div>
        <p className="text-sm text-blue-800 mt-2">
          This is an atomic transaction. All operations will succeed together or fail together.
          {transaction.type === 'transfer' && ' The recipient will see obfuscated transaction data for privacy.'}
        </p>
      </Card>

      {/* Action Buttons */}
      <div className="flex space-x-3 pt-4 border-t">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isLoading} className="flex-1">
            Cancel
          </Button>
        )}
        {onConfirm && (
          <Button
            onClick={onConfirm}
            disabled={isLoading || hasErrors}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm Transaction
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
