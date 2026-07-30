/**
 * /embed/onramp — the iframe TARGET for the "engine by cyrusthegreat" onramp.
 *
 * A chrome-free page (no nav, no BuildBadge, no vault) that renders ONLY the
 * OnrampSection engine, sized to sit inside a host site's <iframe>. Params:
 *   ?to=0xWallet   — deliver-to wallet address
 *   &amount=25     — fiat amount hint
 *   &token=USDC    — target crypto symbol
 *
 * Static-iframe first (per our §9 web rule: a static <iframe> is inert and
 * can't white-flash, unlike a loader script that re-renders its frame). The
 * host embeds this URL directly.
 *
 * NOTE for cross-site embedding: this page must be FRAMABLE by other origins,
 * so the deploy must NOT send `X-Frame-Options: DENY` / a restrictive CSP
 * `frame-ancestors` for /embed/*. On the current Cloudflare static deploy no
 * such header is set, so it frames fine; if one is ever added globally, carve
 * out /embed/*.
 *
 * The engine is self-contained (config-driven, env-gated, no wallet/contract
 * deps), so this route — and the component — lift cleanly into a standalone
 * repo / npm package later with no rewrite.
 */

import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { OnrampSection } from "@/components/shared/OnrampSection";

const EmbedOnramp = () => {
  const [sp] = useSearchParams();
  const to = sp.get("to") ?? undefined;
  const amount = sp.get("amount") ?? undefined;
  const token = sp.get("token") ?? undefined;

  // SOLID dark backdrop so the widget always shows its branded dark-gold (#1)
  // look — NOT washed-out/pale from a light or transparent host bleeding
  // through the semi-transparent tint. The engine is a dark brand artifact.
  const DARK = "hsl(35 25% 8%)";
  useEffect(() => {
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    document.documentElement.style.background = DARK;
    document.body.style.background = DARK;
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, []);

  return (
    <div className="min-h-screen p-3 w-full max-w-md mx-auto" style={{ background: DARK }}>
      <OnrampSection recipientAddress={to} amountFiat={amount} cryptoSymbol={token} />
    </div>
  );
};

export default EmbedOnramp;
