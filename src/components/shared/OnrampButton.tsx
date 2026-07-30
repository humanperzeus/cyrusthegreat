/**
 * OnrampButton — fiat-to-crypto onramp (Apple Pay / Google Pay / card →
 * crypto in the user's wallet) via Ramp Network's client-side SDK.
 *
 * No backend: RampInstantSDK opens a popup/iframe entirely client-side.
 *   - No VITE_RAMP_HOST_API_KEY  → DEMO env (app.demo.rampnetwork.com):
 *     the widget opens and the full flow is walkable with test data. This
 *     is the current state (we don't have a production Ramp key yet).
 *   - VITE_RAMP_HOST_API_KEY set → PRODUCTION: real Apple Pay / card
 *     purchases, crypto delivered to `recipientAddress`.
 *
 * IMPORTANT: onramps deliver crypto on MAINNET (they don't sell testnet
 * tokens). The app is testnet-only today, so this is a working demo /
 * preview that becomes fully live on the mainnet launch + a Ramp key. The
 * button is honestly labelled "(demo)" until the key is present.
 *
 * `recipientAddress` is the user's OWN wallet — the onramp tops up their
 * wallet, then they pay from it. onSuccess fires when Ramp reports a
 * purchase so callers (PayForm) can continue.
 */

import { useCallback } from "react";
import { CreditCard } from "lucide-react";
import { RampInstantSDK } from "@ramp-network/ramp-instant-sdk";

interface OnrampButtonProps {
  /** User's wallet address — onramp delivers fiat-purchased crypto here. */
  recipientAddress?: string;
  /** Fiat amount (e.g., "25" for $25). Optional; user can pick in the widget. */
  amountFiat?: string;
  /** Target crypto token symbol (e.g., "USDC"). Reserved for swapAsset mapping. */
  cryptoSymbol?: string;
  /** Active dapp chain — reserved for network mapping when we go production. */
  chain?: "ETH" | "BSC" | "BASE" | "HYPER" | "ARB";
  /** Called when Ramp reports a purchase was created. */
  onSuccess?: (ref: string) => void;
  /** Extra class for layout (button width, margin). */
  className?: string;
  /** Compact rendering for tight UIs. */
  compact?: boolean;
}

const RAMP_HOST_API_KEY = (import.meta.env.VITE_RAMP_HOST_API_KEY as string | undefined) || undefined;
const IS_PROD_RAMP = !!RAMP_HOST_API_KEY;

export const OnrampButton: React.FC<OnrampButtonProps> = ({
  recipientAddress,
  amountFiat,
  cryptoSymbol: _cryptoSymbol,
  chain: _chain,
  onSuccess,
  className = "",
  compact = false,
}) => {
  const openRamp = useCallback(() => {
    // Demo env needs no key; production uses the host key.
    const config: ConstructorParameters<typeof RampInstantSDK>[0] = {
      hostAppName: "CyrusTresor",
      hostLogoUrl: `${window.location.origin}/ctg.png`,
      variant: "auto",
      ...(recipientAddress ? { userAddress: recipientAddress } : {}),
      ...(amountFiat ? { fiatValue: amountFiat, fiatCurrency: "USD" } : {}),
      ...(IS_PROD_RAMP
        ? { hostApiKey: RAMP_HOST_API_KEY }
        : { url: "https://app.demo.rampnetwork.com" }),
    };

    const widget = new RampInstantSDK(config);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    widget.on("*", (event: any) => {
      if (event?.type === "PURCHASE_CREATED") {
        const ref =
          event?.payload?.purchase?.id ??
          event?.payload?.purchase?.finalTxHash ??
          "ramp-purchase";
        onSuccess?.(String(ref));
      }
    });
    widget.show();
  }, [recipientAddress, amountFiat, onSuccess]);

  const label = IS_PROD_RAMP ? "Buy with Apple Pay / Card" : "Buy with Apple Pay / Card (demo)";

  if (compact) {
    return (
      <button
        type="button"
        onClick={openRamp}
        title="Buy crypto with Apple Pay / Google Pay / card via Ramp Network"
        className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded text-[10px] border border-vault-primary/30 text-vault-primary/80 hover:bg-vault-primary/10 hover:text-vault-primary transition-colors ${className}`}
      >
        <CreditCard className="w-3 h-3" />
        {IS_PROD_RAMP ? "Apple Pay" : "Apple Pay (demo)"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openRamp}
      title="Buy crypto with Apple Pay / Google Pay / card via Ramp Network"
      className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md text-xs border border-vault-primary/40 bg-vault-primary/10 text-vault-primary hover:bg-vault-primary/20 hover:border-vault-primary/70 transition-all ${className}`}
    >
      <CreditCard className="w-3.5 h-3.5" />
      {label}
    </button>
  );
};
