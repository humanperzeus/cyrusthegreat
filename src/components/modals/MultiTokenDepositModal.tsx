/**
 * MultiTokenDepositModal - High Priority Feature
 * Allows users to deposit multiple tokens in a single transaction
 */

import { useState, useEffect } from "react";
import { useProgress } from "@/contexts/ProgressContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { TokenList } from "../tokens/TokenList";
import { formatTokenBalance, convertToWei } from "@/lib/utils";
import { normalizeAmount } from "@/lib/normalizeAmount";

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
  // Called the moment the user clicks Deposit and the operation is
  // about to be submitted. The parent uses this to close BOTH this
  // modal and any wrapping Deposit dialog so the global ProgressFlow
  // (rendered by ProgressProvider at App level) is the only thing
  // floating after that — the page becomes interactive again.
  onCommitted?: () => void;
  onDeposit: (
    deposits: { token: string; amount: string; approvalType: 'exact' | 'unlimited' }[],
    onProgress?: (steps: import('@/components/shared/ProgressFlow').ProgressStep[]) => void,
  ) => Promise<void>;
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
  onCommitted,
  onDeposit,
  isLoading = false,
  rateLimitStatus
}: MultiTokenDepositModalProps) {
  const [deposits, setDeposits] = useState<DepositEntry[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Progress sessions are owned by ProgressContext at App level. We
  // start a new session per submit (unique id), then push step updates
  // through updateProgress. The session outlives this modal closing
  // and stacks alongside any other in-flight sessions.
  // No re-entry lock — second submit replaces the active session; the
  // first lifecycle keeps running in the background (id-guarded
  // updateProgress calls become no-ops). Wallet's own queue serializes
  // signatures. Matches Uniswap/1inch/Aave UX.
  const { startProgress, updateProgress, setProgressExpanded } = useProgress();

  const MAX_TOKENS = 25; // CrossChainBank8 limit
  
  // CRITICAL FIX: Dynamic minimum deposit based on token decimals
  const getMinDeposit = (decimals: number): string => {
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



  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setDeposits([]);
      setSelectedToken(null);
    }
  }, [isOpen]);

  const validateDeposit = (token: Token, amount: string): { isValid: boolean; error?: string } => {
    if (!amount) {
      return { isValid: false, error: "Amount must be greater than 0" };
    }

    // Normalize locale-formatted input ("0,1" / "1,234.56" / "1 234,56")
    // to the parser-friendly "1234.56" form BEFORE any numeric parsing
    // runs. Anything that fails normalization (multiple decimal points,
    // mixed nonsense, junk characters) is caught here as a clear error
    // instead of slipping through to convertToWei and surfacing as a
    // confusing parser exception further down the deposit flow.
    let normalized: string;
    try {
      normalized = normalizeAmount(amount);
    } catch (e: any) {
      return { isValid: false, error: e?.message || "Invalid amount" };
    }

    if (parseFloat(normalized) <= 0) {
      return { isValid: false, error: "Amount must be greater than 0" };
    }

    // CRITICAL FIX: Use dynamic minimum based on token decimals
    const minDeposit = getMinDeposit(token.decimals);
    if (parseFloat(normalized) < parseFloat(minDeposit)) {
      return { isValid: false, error: `Minimum deposit is ${minDeposit} ${token.symbol}` };
    }

    // Compare wei to wei. token.balance is already a raw-wei decimal-integer
    // string at every call site (useVault.ts wallet/vault native + ERC-20
    // paths all produce BigInt.toString()), so parse it directly. Passing it
    // through convertToWei would multiply by 10**decimals a second time and
    // silently disable the check for any non-zero balance.
    const amountInSmallestUnit = convertToWei(normalized, token.decimals);
    const balanceInSmallestUnit = BigInt(token.balance);

    if (amountInSmallestUnit > balanceInSmallestUnit) {
      return { isValid: false, error: `Insufficient balance. Max: ${formatTokenBalance(token.balance, token.decimals)}` };
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
    if (deposits.length >= MAX_TOKENS) {
      return;
    }

    // Check if token is already added
    const validation = validateTokenSelection(token);
    if (!validation.isValid) {
      return; // Don't add if validation fails
    }

    const newDeposit: DepositEntry = {
      token,
      amount: "",
      isValid: false,
      // Approval policy reversal (2026-06-10) — reverses 272eaa2.
      //
      // DEFAULT = 'exact' (amount + 10% buffer). The earlier all-MAX
      // policy was driven by decimal-typo fear, but an unbounded
      // allowance is a long-lived security footgun: it persists across
      // sessions, lets the vault (or any future upgrade target) move
      // arbitrary amounts of that token at any time. The +10% headroom
      // covers parse/round wobble; the amount-input normalization (see
      // utils/normalizeAmount) handles the locale comma/period
      // confusion that drove the original all-MAX decision.
      //
      // Users who genuinely want fire-and-forget approvals can tick
      // the per-row "Max approve" toggle (sets approvalType: 'unlimited').
      approvalType: 'exact',
    };

    setDeposits(prev => [...prev, newDeposit]);
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

  // Per-row approval toggle: ticked = MAX_UINT256 (unbounded, opt-in),
  // unticked = 'exact' = amount + 10% buffer (the new safer default).
  const toggleMaxApprove = (index: number) => {
    setDeposits(prev => prev.map((d, i) =>
      i === index
        ? { ...d, approvalType: d.approvalType === 'unlimited' ? 'exact' : 'unlimited' }
        : d
    ));
  };

  const removeDeposit = (index: number) => {
    setDeposits(prev => prev.filter((_, i) => i !== index));
  };



  const isFormValid = () => {
    return deposits.length > 0 && deposits.every(d => d.isValid && d.amount);
  };

  const handleDeposit = async () => {
    if (!isFormValid()) {
      return;
    }

    // Normalize amounts before they cross into useVault — that side
    // calls convertToWei (parseUnits under the hood), which only
    // understands "1234.56" form. isFormValid() already enforced that
    // every amount normalizes cleanly, so we can throw on failure here
    // as an internal invariant rather than user error.
    const depositData = deposits.map(d => ({
      token: d.token.address,
      amount: normalizeAmount(d.amount),
      approvalType: d.approvalType,
    }));

    // Start a NEW progress session for this submit. startProgress
    // returns the session id; we use it to scope all subsequent
    // updateProgress calls so concurrent submits don't trample each
    // other. The seed step gives the user immediate feedback BEFORE
    // the parent dialog closes.
    const sessionId = startProgress(
      'Multi-token batch deposit',
      [{ label: 'Preparing deposit…', status: 'running', detail: `Submitting ${depositData.length} token${depositData.length === 1 ? '' : 's'}…` }],
    );
    // Start as corner chip so it doesn't overlap the Radix
    // DialogContent close animation that onCommitted triggers
    // (duration-200 on this dialog + its wrapping DepositModal);
    // re-expand once both layers have unmounted.
    setProgressExpanded(false);

    // Notify the parent (DepositModal) that we've committed — it
    // closes both this dialog and itself, freeing the page so the
    // user can keep working while the tx pends.
    onCommitted?.();
    setTimeout(() => setProgressExpanded(true), 250);

    // Run the operation in the background; useVault.depositMultiple…
    // pushes step updates into this session via its onProgress
    // callback. We don't await — the modal already closed, and the
    // wallet round-trip is owned by the session, not by this handler.
    onDeposit(depositData, (steps) => {
      updateProgress(sessionId, steps);
    }).catch((error) => {
      // useVault already pushes a failed-status step on errors via the
      // onProgress emit chain, so the user sees a red ✗ in the chip /
      // modal. Logging here is just for the console trail.
      console.error("Deposit failed:", error);
    });
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
                            // type="text" not "number" — the latter blocks
                            // commas/spaces in EU/FR locales BEFORE our
                            // normalizeAmount can interpret them. inputMode
                            // gives mobile the right numeric keypad.
                            type="text"
                            inputMode="decimal"
                            placeholder="Amount"
                            value={deposit.amount}
                            onChange={(e) => updateDepositAmount(index, e.target.value)}
                            className={`flex-1 ${!deposit.isValid && deposit.amount ? 'border-red-500' : ''}`}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // CRITICAL FIX: Use formatted balance for MAX button, not raw balance
                              const formattedBalance = formatTokenBalance(deposit.token.balance, deposit.token.decimals);
                              updateDepositAmount(index, formattedBalance);
                            }}
                            disabled={isLoading}
                            className="px-2 py-1 h-8 text-xs"
                          >
                            MAX
                          </Button>
                        </div>
                        <div className="text-sm text-gray-600">
                                                        Balance: {formatTokenBalance(deposit.token.balance, deposit.token.decimals)} {deposit.token.symbol}
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

                    {/* Approval policy (2026-06-10 reversal of 272eaa2):
                        DEFAULT = finite (amount + 10% buffer) because an
                        unbounded allowance is a long-lived security
                        footgun. Locale comma/period confusion is now
                        handled by amount normalization upstream, so the
                        original "always max to dodge typos" rationale
                        doesn't hold anymore. Users who actually want a
                        one-time approve-and-forget tick the box below. */}
                    {deposit.token.address !== '0x0000000000000000000000000000000000000000' ? (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <label className="flex items-start gap-2 text-xs cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={deposit.approvalType === 'unlimited'}
                            onChange={() => toggleMaxApprove(index)}
                            disabled={isLoading}
                            className="mt-0.5"
                          />
                          <span className="text-gray-700">
                            <b>Max approve {deposit.token.symbol}</b> — tick to approve the full <code>MAX_UINT256</code> allowance once instead of <i>amount + 10%</i> this transaction only.
                            <div className="text-gray-500 mt-0.5">
                              {deposit.approvalType === 'unlimited'
                                ? `🔓 Will approve unlimited ${deposit.token.symbol}. Future deposits skip the approve step but the vault keeps unbounded access until you revoke.`
                                : `✓ Will approve ${deposit.token.symbol} just for this deposit (+10% buffer for rounding). Safer; you'll re-approve next time.`}
                            </div>
                          </span>
                        </label>
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

          {/* ProgressFlow is rendered globally by ProgressProvider in
              App.tsx — no longer mounted inside this modal. This keeps
              the floating overlay / chip alive after this dialog and
              its parent close on commit, so the user can keep working
              while the tx pends. */}

          {/* Action Buttons */}
          <div className="flex justify-between space-x-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={isValidating}>
              Cancel
            </Button>
            {/* isLoading dropped — see DepositModal for the rationale. */}
            <Button
              onClick={handleDeposit}
              disabled={!isFormValid() || isValidating || (rateLimitStatus?.remaining === 0)}
            >
              {isValidating ? "Signing…" : `Deposit ${deposits.length} Tokens`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
