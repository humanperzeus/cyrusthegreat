import { useState, useEffect } from "react";
import { formatTokenBalance, preventScientificNotation } from "@/lib/utils";
import { parseEther, formatEther } from "viem";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Info, Loader2, Coins, Zap } from "lucide-react";
import { useProgress } from "@/contexts/ProgressContext";
import { getChainConfig } from "@/config/web3";
import { MultiTokenDepositModal } from "./MultiTokenDepositModal";
import { RateLimitStatusDisplay } from "../shared/RateLimitStatusDisplay";

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Single-asset paths now accept an optional onProgress channel so the
  // submit handler can drive the App-level ProgressFlow, matching the
  // multi-token path. The callbacks are unchanged for any caller that
  // doesn't pass the second arg.
  onDeposit: (
    amount: string,
    onProgress?: (steps: import('@/components/shared/ProgressFlow').ProgressStep[]) => void,
  ) => void;
  onTokenDeposit?: (
    tokenAddress: string,
    amount: string,
    tokenSymbol: string,
    onProgress?: (steps: import('@/components/shared/ProgressFlow').ProgressStep[]) => void,
  ) => void;
  onMultiTokenDeposit?: (
    deposits: { token: string; amount: string; approvalType: 'exact' | 'unlimited' }[],
    onProgress?: (steps: import('@/components/shared/ProgressFlow').ProgressStep[]) => void,
  ) => Promise<void>;
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
  activeChain?: 'ETH' | 'BSC' | 'BASE' | 'ARB' | 'HYPER';
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
  
  // ✅ DEBUG: Log when this modal is rendered
  console.log('🔍 DepositModal RENDERED:', {
    open,
    isTokenDeposit,
    tokenSymbol,
    tokenBalance,
    availableTokensCount: availableTokens.length
  });
  const [amount, setAmount] = useState("");
  // Single-asset deposit opens a ProgressFlow session on submit.
  // Concurrent submits coexist (each gets its own id and chip) —
  // wallet's signature queue is the real serializer; the UI just
  // stacks chips so the user can see what's pending where.
  const { startProgress, updateProgress, expandProgress } = useProgress();
  const [isMultiTokenMode, setIsMultiTokenMode] = useState(false);
  const [showMultiTokenModal, setShowMultiTokenModal] = useState(false);

  // Reset the form whenever the dialog opens fresh OR the parent swaps
  // the token target (e.g. user just submitted USD1 then clicks WLFI).
  // The modal stays MOUNTED in Index.tsx, so useState("") at component
  // declaration doesn't actually run between opens — without this
  // effect, the previous submit's amount leaked into the next session's
  // form ("Deposit 50 USD1, close, open WLFI → amount field shows 50").
  useEffect(() => {
    if (open) {
      setAmount("");
    }
  }, [open, tokenAddress]);

  // Auto-close modal after successful transaction (now handled centrally in Index.tsx)
  // Removed to prevent conflicts with centralized modal management

  // Reset multi-token mode when modal opens/closes
  useEffect(() => {
    if (!open) {
      setIsMultiTokenMode(false);
      setShowMultiTokenModal(false);
    }
  }, [open]);

  // CRITICAL FIX: Ensure amount is always clean and never in scientific notation
  useEffect(() => {
    if (amount) {
      const cleanAmount = ensureCleanAmount(amount);
      if (cleanAmount !== amount) {
        console.log(`🔧 Amount cleaned from: ${amount} → ${cleanAmount}`);
        setAmount(cleanAmount);
      }
    }
  }, [amount]);

  const handleMultiTokenDeposit = async (
    deposits: { token: string; amount: string; approvalType: 'exact' | 'unlimited' }[],
    onProgress?: (steps: import('@/components/shared/ProgressFlow').ProgressStep[]) => void,
  ) => {
    if (onMultiTokenDeposit) {
      // Forward the progress callback through to Index.tsx → useVault so
      // MultiTokenDepositModal's <ProgressFlow> receives live step updates.
      await onMultiTokenDeposit(deposits, onProgress);
    }
  };

  const handleDeposit = () => {
    // CRITICAL FIX: Don't convert amount to Number - it causes scientific notation
    if (amount && amount.trim() !== '') {
      onDeposit(amount);
      // Don't reset amount here - wait for transaction confirmation
    }
  };

  // CRITICAL FIX: Ensure amount is always clean and never in scientific notation
  const ensureCleanAmount = (amount: string): string => {
    if (!amount) return amount;
    
    // Prevent scientific notation
    const cleanAmount = preventScientificNotation(amount);
    
    // Additional validation: ensure it's a valid decimal number
    if (cleanAmount.includes('e') || cleanAmount.includes('E')) {
      console.error('🚨 Scientific notation still detected after cleaning:', cleanAmount);
      return '0'; // Fallback to prevent errors
    }
    
    return cleanAmount;
  };

  const handleMaxDeposit = () => {
    if (isTokenDeposit && tokenBalance) {
      // CRITICAL FIX: Prevent scientific notation conversion for token balances
      // For tokens, use the formatted balance (fee is paid separately)
      const tokenDecimals = availableTokens?.find(t => t.address === tokenAddress)?.decimals || 18;
      
      // Prevent scientific notation before formatting
      const cleanBalance = preventScientificNotation(tokenBalance);
      console.log(`🔧 MAX button - Original balance: ${tokenBalance}, Clean balance: ${cleanBalance}`);
      
      const formattedBalance = formatTokenBalance(cleanBalance, tokenDecimals);
      console.log(`🔧 MAX button - Formatted balance: ${formattedBalance}`);
      
      // Ensure the final amount is clean
      const finalCleanAmount = ensureCleanAmount(formattedBalance);
      console.log(`🔧 MAX button - Final clean amount: ${finalCleanAmount}`);
      
      setAmount(finalCleanAmount);
    } else {
      // CRITICAL FIX: For ETH, preserve full precision when calculating max amount
      // Convert to BigInt for precise arithmetic, then format for display
      try {
        const walletBalanceWei = parseEther(walletBalance);
        const feeWei = parseEther(currentFee);
        const maxAmountWei = walletBalanceWei - feeWei;
        
        if (maxAmountWei > 0n) {
          // Format with full precision using formatEther
          const maxAmountFormatted = formatEther(maxAmountWei);
          setAmount(maxAmountFormatted);
        } else {
          setAmount("0");
        }
      } catch (error) {
        console.error('❌ Error calculating max ETH amount:', error);
        // Fallback to simple calculation
        const maxAmount = Math.max(0, Number(walletBalance) - Number(currentFee));
        setAmount(maxAmount.toString());
      }
    }
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

            {/* Multi-Token Toggle - Only for token deposits */}
            {isTokenDeposit && onMultiTokenDeposit && availableTokens.length > 0 && (
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
                type="text"
                placeholder="0.0"
                value={amount}
                onChange={(e) => {
                  // CRITICAL FIX: Prevent scientific notation in input
                  const inputValue = e.target.value;
                  if (inputValue.includes('e') || inputValue.includes('E')) {
                    console.warn('⚠️ Scientific notation detected in input, preventing conversion');
                    return; // Don't allow scientific notation
                  }
                  
                  // Ensure the amount is always clean
                  const cleanAmount = ensureCleanAmount(inputValue);
                  setAmount(cleanAmount);
                }}
                pattern="[0-9]*\.?[0-9]*"
                inputMode="decimal"
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
              <span className="font-mono">
                {isTokenDeposit 
                  ? `${formatTokenBalance(tokenBalance || "0", availableTokens?.find(t => t.address === tokenAddress)?.decimals || 18)} ${tokenSymbol}` 
                  : `${formatTokenBalance(walletBalance, 18)} ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}`
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
            {!isTokenDeposit && amount && amount.trim() !== '' && (
              <div className="flex justify-between text-sm text-green-600 font-semibold">
                <span>Total {activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} to Send:</span>
                <span className="font-mono">
                  {/* CRITICAL FIX: Use BigInt arithmetic to prevent scientific notation */}
                  {(() => {
                    try {
                      const amountWei = parseEther(amount);
                      const feeWei = parseEther(currentFee);
                      const totalWei = amountWei + feeWei;
                      return formatEther(totalWei);
                    } catch (error) {
                      console.error('❌ Error calculating total:', error);
                      return 'Error calculating total';
                    }
                  })()} {activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}
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
                // Start a global ProgressFlow session — same pattern as the
                // multi-token sub-modal. The seed step gives instant
                // feedback BEFORE the dialog closes so the user never
                // sees a frame without state.
                const title = isTokenDeposit && tokenSymbol
                  ? `Single ${tokenSymbol} deposit`
                  : `Single ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'} deposit`;
                const sessionId = startProgress(
                  title,
                  [{ label: 'Preparing deposit…', status: 'running', detail: `Submitting ${amount}…` }],
                );
                // W4 chip-during-close timing: collapse everything to
                // chips so this new session mounts as a corner chip
                // while Radix runs its 200ms DialogContent exit
                // animation. Without this, both cards are centered at
                // once and the user sees them overlap.
                expandProgress(null);
                onOpenChange(false);
                // Re-expand THIS session after Radix has fully
                // unmounted (250 > 200ms). Passing the new id (not
                // boolean) is what makes this safe under multi-session:
                // even if another session arrives in between, we still
                // expand the one this submit started.
                setTimeout(() => expandProgress(sessionId), 250);
                // Fire the deposit in the background — useVault pushes
                // step updates through the onProgress callback we hand it.
                if (isTokenDeposit && tokenAddress && tokenSymbol && onTokenDeposit) {
                  onTokenDeposit(tokenAddress, amount, tokenSymbol, (steps) => updateProgress(sessionId, steps));
                } else {
                  onDeposit(amount, (steps) => updateProgress(sessionId, steps));
                }
              }}
              // isLoading deliberately dropped from this check (2026-06-10):
              // it was global across the whole hook (any tx anywhere), so
              // opening THIS modal while an unrelated tx was in flight
              // greyed the submit and showed "Depositing…" for the wrong
              // tx. Modal closes immediately on submit anyway, so a
              // brief mid-click race here is impossible. Wallet handles
              // signature serialization in its own queue.
              // Number(amount) > 0 collapses the old 4-clause check
              // and additionally catches "0.00", "0.000", " 0 ", "-1",
              // "abc" — the contract still charges the fee on a
              // 0-amount deposit, so block it at the UI.
              disabled={!(Number(amount) > 0)}
              className="w-full"
            >
              {isSimulating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Checking...
                </>
              ) : (
                isTokenDeposit
                  ? `Deposit ${tokenSymbol}`
                  : `Deposit ${activeChain ? getChainConfig(activeChain).nativeCurrency.symbol : 'ETH'}`
              )}
            </Button>
          )}

          {/* Multi-Token Deposit Button */}
          {isMultiTokenMode && isTokenDeposit && (
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
      {showMultiTokenModal && onMultiTokenDeposit && isTokenDeposit && (
        <MultiTokenDepositModal
          isOpen={showMultiTokenModal}
          onClose={() => {
            // Cancel/back-out: only close the multi-token sub-modal,
            // keep the outer DepositModal open so the user can pick
            // single-asset mode if they want.
            setShowMultiTokenModal(false);
          }}
          onCommitted={() => {
            // Submit path: close BOTH this sub-modal AND the wrapping
            // DepositModal so the global ProgressFlow (App-level) is
            // the only floating layer and the page becomes
            // interactive again as the tx pends.
            setShowMultiTokenModal(false);
            onOpenChange(false);
          }}
          availableTokens={availableTokens}
          onDeposit={handleMultiTokenDeposit}
          isLoading={isLoading}
          rateLimitStatus={rateLimitStatus}
        />
      )}
    </Dialog>
  );
};