/**
 * OnrampButton — provider-agnostic placeholder for the fiat-to-crypto
 * onramp button (Apple Pay / credit card → stablecoin in user's wallet).
 *
 * Current state: disabled placeholder. Tooltip explains what it'll do
 * once an onramp provider lands. Architecture is designed so we can
 * swap providers without touching call sites — when Transak (or MoonPay,
 * Ramp, Onramp.money) approves us, we wire the integration here only.
 *
 * Why provider-agnostic: we've submitted to multiple onramps in parallel
 * to race for approval. Whichever lands first gets wired into this
 * component. Call sites (PayForm, Fund) don't change.
 *
 * Expected provider integration flow (when wired):
 *   1. User clicks → onramp widget opens (modal / popup / embedded iframe)
 *   2. User picks fiat amount (locked to props.amountFiat if set), confirms
 *      Apple Pay / card via the provider's UI
 *   3. Provider runs KYC if needed (first-time users), processes payment
 *   4. Provider delivers crypto to props.recipientAddress (which is the
 *      user's own wallet, NOT the payment recipient — onramp goes to YOUR
 *      wallet, THEN you commit to the pool)
 *   5. Provider fires their onComplete callback → props.onSuccess(txHash)
 *   6. Caller continues with the commit flow (e.g., PayForm auto-clicks
 *      Pay after the onramp succeeds)
 *
 * Provider notes:
 *   - Transak: free sandbox key, ~1-2 week approval. SDK: @transak/transak-sdk.
 *   - MoonPay: similar shape, slightly heavier brand. SDK: @moonpay/moonpay-js.
 *   - Ramp: simplest API, cheapest fees. SDK: @ramp-network/ramp-instant-sdk.
 *   - Onramp.money: smallest player, no-KYC up to $200. SDK: simple URL embed.
 */

import { CreditCard } from "lucide-react";

interface OnrampButtonProps {
  /** User's wallet address — onramp delivers fiat-purchased crypto here. */
  recipientAddress?: string;
  /** Fiat amount (e.g., "25" for $25). Optional; provider lets user pick if omitted. */
  amountFiat?: string;
  /** Target crypto token symbol (e.g., "USDC", "USDT", "USD1"). */
  cryptoSymbol?: string;
  /** Active dapp chain — used to pick the provider's chain config. */
  chain?: "ETH" | "BSC" | "BASE" | "HYPER" | "ARB";
  /** Called when the onramp completes successfully + funds land in wallet. */
  onSuccess?: (cryptoTxHash: string) => void;
  /** Extra class for layout (button width, margin). */
  className?: string;
  /** Compact rendering (smaller, no label "coming soon" — for tight UIs). */
  compact?: boolean;
}

export const OnrampButton: React.FC<OnrampButtonProps> = ({
  recipientAddress: _recipientAddress,
  amountFiat: _amountFiat,
  cryptoSymbol: _cryptoSymbol,
  chain: _chain,
  onSuccess: _onSuccess,
  className = "",
  compact = false,
}) => {
  // Disabled placeholder until provider API key arrives. Suppress unused-prop
  // lint by referencing them in the destructure with _ prefix — they're the
  // documented interface, future-self knows what to pass.

  const tooltipText =
    "Apple Pay / credit card → crypto in your wallet → automatic payment to recipient. " +
    "Pending onramp partner approval (Transak / MoonPay / Ramp). Will light up once one of " +
    "them approves cyrusthegreat as a dApp partner.";

  if (compact) {
    return (
      <button
        type="button"
        disabled
        title={tooltipText}
        className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded text-[10px] border border-dashed border-vault-primary/30 text-muted-foreground/60 cursor-not-allowed ${className}`}
      >
        <CreditCard className="w-3 h-3" />
        Apple Pay (soon)
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled
      title={tooltipText}
      className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md text-xs border border-dashed border-vault-primary/30 text-muted-foreground/60 cursor-not-allowed ${className}`}
    >
      <CreditCard className="w-3.5 h-3.5" />
      Buy with Apple Pay / Card (coming soon)
    </button>
  );
};
