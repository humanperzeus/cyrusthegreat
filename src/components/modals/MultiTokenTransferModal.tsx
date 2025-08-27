/**
 * MultiTokenTransferModal - Multi-Token Transfer Feature
 * Allows users to transfer multiple tokens to another vault user in a single transaction
 */

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, AlertTriangle, CheckCircle, Clock, ArrowRight, User } from "lucide-react";
import { formatTokenBalance } from "@/lib/utils";

interface Token {
  address: string;
  symbol: string;
  balance: string;
  decimals: number;
  isNative?: boolean;
}

interface TransferEntry {
  token: Token;
  amount: string;
  isValid: boolean;
  error?: string;
}

interface MultiTokenTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableTokens: Token[];
  onTransfer: (transfers: { token: string; amount: string }[], to: string) => Promise<void>;
  isLoading?: boolean;
  rateLimitStatus?: {
    remaining: number;
    total: number;
    resetTime: number;
  };
}

export function MultiTokenTransferModal({
  isOpen,
  onClose,
  availableTokens,
  onTransfer,
  isLoading = false,
  rateLimitStatus
}: MultiTokenTransferModalProps) {
  const [transfers, setTransfers] = useState<TransferEntry[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const MAX_TOKENS = 25; // CrossChainBank8 limit
  
  // CRITICAL FIX: Dynamic minimum transfer based on token decimals
  const getMinTransfer = (decimals: number): string => {
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
      setTransfers([]);
      setRecipientAddress("");
      setSelectedToken(null);
    }
  }, [isOpen]);

  const validateTransfer = (token: Token, amount: string): { isValid: boolean; error?: string } => {
    if (!amount || parseFloat(amount) <= 0) {
      return { isValid: false, error: "Amount must be greater than 0" };
    }

    // CRITICAL FIX: Use dynamic minimum based on token decimals
    const minTransfer = getMinTransfer(token.decimals);
    if (parseFloat(amount) < parseFloat(minTransfer)) {
      return { isValid: false, error: `Minimum transfer is ${minTransfer} ${token.symbol}` };
    }

    const balance = parseFloat(token.balance);
    if (parseFloat(amount) > balance) {
      return { isValid: false, error: `Insufficient vault balance. Max: ${formatBalance(balance, token.decimals)}` };
    }

    return { isValid: true };
  };

  const validateRecipientAddress = (address: string): { isValid: boolean; error?: string } => {
    if (!address || address.trim() === "") {
      return { isValid: false, error: "Recipient address is required" };
    }

    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return { isValid: false, error: "Invalid Ethereum address format" };
    }

    return { isValid: true };
  };

  const validateTokenSelection = (token: Token): { isValid: boolean; error?: string } => {
    // Check for duplicate tokens only when selecting/adding
    const duplicateCount = transfers.filter(t => t.token.address === token.address).length;
    if (duplicateCount > 0) {
      return { isValid: false, error: "Token already added to transfer" };
    }
    return { isValid: true };
  };

  const addTokenToTransfer = (token: Token) => {
    if (transfers.length >= MAX_TOKENS) {
      return;
    }

    // Check if token is already added
    const validation = validateTokenSelection(token);
    if (!validation.isValid) {
      return; // Don't add if validation fails
    }

    const newTransfer: TransferEntry = {
      token,
      amount: "",
      isValid: false,
    };

    setTransfers(prev => [...prev, newTransfer]);
    setSelectedToken(null);
  };

  const updateTransferAmount = (index: number, amount: string) => {
    console.log(`updateTransferAmount: index=${index}, amount="${amount}"`);
    setTransfers(prev => prev.map((transfer, i) => {
      if (i === index) {
        const validation = validateTransfer(transfer.token, amount);
        console.log(`Validating transfer for ${transfer.token.symbol}: amount=${amount}, valid=${validation.isValid}, error=${validation.error}`);
        const updatedTransfer = {
          ...transfer,
          amount,
          isValid: validation.isValid,
          error: validation.error
        };
        console.log('Updated transfer:', updatedTransfer);
        return updatedTransfer;
      }
      return transfer;
    }));
  };

  const removeTransfer = (index: number) => {
    setTransfers(prev => prev.filter((_, i) => i !== index));
  };

  const isFormValid = () => {
    const recipientValid = validateRecipientAddress(recipientAddress).isValid;
    const transfersValid = transfers.length > 0 && transfers.every(t => t.isValid && t.amount);
    return recipientValid && transfersValid;
  };

  const handleTransfer = () => {
    if (!isFormValid()) {
      return;
    }

    setIsValidating(true);
    try {
      const transferData = transfers.map(t => ({
        token: t.token.address,
        amount: t.amount
      }));

      onTransfer(transferData, recipientAddress);
      // Don't close modal immediately - let wagmi hooks handle transaction state
      setTimeout(() => {
        onClose();
        setIsValidating(false);
      }, 2000);
    } catch (error) {
      console.error("Transfer failed:", error);
      setIsValidating(false);
    }
  };

  // Filter out ETH/native tokens and already selected tokens
  const availableTokensForSelection = availableTokens.filter(token =>
    // Exclude ETH/native token (0x0 address)
    token.address !== '0x0000000000000000000000000000000000000000' &&
    // Exclude already selected tokens
    !transfers.some(t => t.token.address === token.address)
  );

  const recipientValidation = validateRecipientAddress(recipientAddress);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <ArrowRight className="w-6 h-6 text-vault-success" />
            <span>Multi-Token Transfer</span>
            <Badge variant="secondary">{transfers.length}/{MAX_TOKENS}</Badge>
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

          {/* Recipient Address */}
          <div className="space-y-3">
            <h3 className="font-medium flex items-center space-x-2">
              <User className="w-4 h-4" />
              <span>Recipient Address</span>
            </h3>
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="0x..."
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className={`${!recipientValidation.isValid && recipientAddress ? 'border-red-500' : ''}`}
              />
              {recipientValidation.error && (
                <div className="text-red-600 text-sm flex items-center space-x-1">
                  <AlertTriangle className="h-3 w-3" />
                  <span>{recipientValidation.error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Selected Tokens */}
          {transfers.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">Selected Tokens ({transfers.length})</h3>
              <div className="space-y-2">
                {transfers.map((transfer, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="font-medium">{transfer.token.symbol}</div>
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            placeholder="Amount"
                            value={transfer.amount}
                            onChange={(e) => updateTransferAmount(index, e.target.value)}
                            className={`flex-1 ${!transfer.isValid && transfer.amount ? 'border-red-500' : ''}`}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateTransferAmount(index, transfer.token.balance)}
                            disabled={isLoading}
                            className="px-2 py-1 h-8 text-xs"
                          >
                            MAX
                          </Button>
                        </div>
                        <div className="text-sm text-gray-600">
                          Vault Balance: {formatBalance(parseFloat(transfer.token.balance), transfer.token.decimals)} {transfer.token.symbol}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTransfer(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {transfer.error && (
                      <div className="text-red-600 text-sm mt-2 flex items-center space-x-1">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{transfer.error}</span>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Add Token Section */}
          {transfers.length < MAX_TOKENS && (
            <div className="space-y-3">
              <h3 className="font-medium">Add Token to Transfer</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {availableTokensForSelection.map((token, index) => (
                  <Card
                    key={index}
                    className="p-3 cursor-pointer hover:bg-background/40 transition-colors"
                    onClick={() => addTokenToTransfer(token)}
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
              {availableTokensForSelection.length === 0 && transfers.length > 0 && (
                <div className="text-center p-4 text-muted-foreground">
                  All vault tokens have been added to transfer
                </div>
              )}
              {availableTokensForSelection.length === 0 && transfers.length === 0 && (
                <div className="text-center p-4 text-muted-foreground">
                  No tokens available in vault for transfer
                </div>
              )}
            </div>
          )}

          {/* Validation Summary */}
          {transfers.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium">Validation Summary</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  {recipientValidation.isValid && transfers.every(t => t.isValid) ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="text-sm">
                    {recipientValidation.isValid ? "✅" : "❌"} Recipient •
                    {transfers.filter(t => t.isValid).length}/{transfers.length} transfers valid
                  </span>
                </div>
                <Progress
                  value={(transfers.filter(t => t.isValid).length / transfers.length) * 100}
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
              onClick={handleTransfer}
              disabled={!isFormValid() || isLoading || isValidating || (rateLimitStatus?.remaining === 0)}
            >
              {isValidating ? "Validating..." : isLoading ? "Transferring..." : `Transfer ${transfers.length} Tokens`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
