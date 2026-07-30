/**
 * OnrampSection — "Buy crypto with Apple Pay / Google Pay / card" with a
 * CHOICE of 6 onramp providers, curated for lightest-KYC + privacy-friendly
 * jurisdiction + Apple/Google-Pay support + easy (frontend-only) integration.
 *
 * Reality check baked into the copy: card + Apple/Google Pay rails legally
 * require at least LIGHT KYC (Visa/MC + AML) — there is no Apple-Pay-with-
 * zero-KYC. So these are ranked by low/fast KYC, not "no KYC". Onramper (an
 * aggregator that smart-routes to the lowest-friction provider per region)
 * is the top pick.
 *
 * Each provider opens its hosted onramp in a NEW TAB — 100% frontend, no
 * backend. Gated on its own env var: set it → opens pre-configured; empty →
 * opens the provider's site + a "setup" marker so we know a key is pending.
 * Onramper/Ramp URLs are built from an apiKey; the others take a full
 * partner widget URL (paste it once you have the account) with a sensible
 * site default.
 *
 * Onramps deliver crypto on MAINNET (they don't sell testnet tokens) — said
 * plainly in the caveat line.
 */

import { CreditCard, ExternalLink, Star, Zap } from "lucide-react";

interface OnrampSectionProps {
  recipientAddress?: string;
  amountFiat?: string;
  cryptoSymbol?: string;
  className?: string;
  /** Hide the "powered by CyrusGate" brand footer (default shown). */
  hideBrand?: boolean;
}

const env = (k: string) => ((import.meta.env as Record<string, string | undefined>)[k] || "").trim();

// Staging by default (testable, no real money) until VITE_ONRAMP_ENV=production.
const STAGING = (env("VITE_ONRAMP_ENV") || "staging").toLowerCase() !== "production";

interface Provider {
  key: string;
  name: string;
  methods: string;   // payment methods
  kyc: string;       // KYC posture (short)
  kycTone: "good" | "ok";
  best?: boolean;
  configured: boolean;
  url: string;
}

function buildProviders(recipient?: string, amountFiat?: string, symbol?: string): Provider[] {
  const q = (o: Record<string, string | undefined>) =>
    new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]).toString();

  const rampKey = env("VITE_RAMP_HOST_API_KEY");
  const guardarianUrl = env("VITE_GUARDARIAN_URL");
  const mercuryoUrl = env("VITE_MERCURYO_URL");
  const alchemypayUrl = env("VITE_ALCHEMYPAY_URL");
  const onrampmoneyUrl = env("VITE_ONRAMPMONEY_URL");

  // While the app is testnet-only, run onramps in STAGING/sandbox: the full
  // flow is testable but NO real money moves. Flip VITE_ONRAMP_ENV=production
  // at mainnet launch. Ramp uses a different base URL for staging; the *_URL
  // providers are switched by pasting the staging widget URL into the env var.
  const rampBase = STAGING ? "https://app.demo.ramp.network" : "https://app.ramp.network";

  // Onramper dropped — it's a PAID aggregator ($200/mo). We integrate the
  // direct providers instead: all free to integrate, they pay US a referral
  // commission on volume. Ramp leads (self-serve, reputable, client-side).
  return [
    {
      key: "ramp",
      name: "Ramp",
      methods: "Apple Pay · Google Pay · card",
      kyc: "light first-buy",
      kycTone: "ok",
      best: true,
      configured: !!rampKey,
      url: `${rampBase}/?${q({
        hostApiKey: rampKey || undefined,
        userAddress: recipient,
        fiatValue: amountFiat,
        fiatCurrency: amountFiat ? "USD" : undefined,
        hostAppName: "CyrusTresor",
      })}`,
    },
    {
      key: "guardarian",
      name: "Guardarian",
      methods: "Apple/Google Pay · card · bank",
      kyc: "no signup for small buys",
      kycTone: "good",
      configured: !!guardarianUrl,
      url: guardarianUrl || "https://guardarian.com/",
    },
    {
      key: "mercuryo",
      name: "Mercuryo",
      methods: "Apple/Google Pay · card",
      kyc: "light KYC, small amounts",
      kycTone: "good",
      configured: !!mercuryoUrl,
      url: mercuryoUrl || "https://mercuryo.io/",
    },
    {
      key: "alchemypay",
      name: "Alchemy Pay",
      methods: "Apple/Google Pay · 300+ methods",
      kyc: "low-KYC in some regions",
      kycTone: "ok",
      configured: !!alchemypayUrl,
      url: alchemypayUrl || "https://ramp.alchemypay.org/",
    },
    {
      key: "onrampmoney",
      name: "Onramp.money",
      methods: "UPI · SEPA · PIX · card",
      kyc: "lower KYC by region",
      kycTone: "good",
      configured: !!onrampmoneyUrl,
      url: onrampmoneyUrl || "https://onramp.money/",
    },
  ];
}

export const OnrampSection: React.FC<OnrampSectionProps> = ({
  recipientAddress,
  amountFiat,
  cryptoSymbol,
  className = "",
  hideBrand = false,
}) => {
  const providers = buildProviders(recipientAddress, amountFiat, cryptoSymbol);

  return (
    <div className={`rounded-lg border-2 border-vault-primary/40 bg-vault-primary/10 p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-vault-primary/25 flex items-center justify-center">
          <CreditCard className="w-4 h-4 text-vault-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-vault-primary leading-tight">Buy crypto — Apple Pay / Google Pay / card</p>
            {STAGING && (
              <span className="text-[8px] font-bold uppercase text-yellow-200 bg-yellow-500/20 border border-yellow-500/40 rounded px-1.5 py-0.5">🧪 test mode</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/90 leading-tight">
            {STAGING
              ? <>Sandbox — walk the full flow, <span className="text-foreground font-medium">no real money moves</span> (live at mainnet).</>
              : <>Pick a provider. Delivered to your wallet on <span className="text-foreground font-medium">mainnet</span>.</>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {providers.map((p) => (
          <a
            key={p.key}
            href={p.url}
            target="_blank"
            rel="noreferrer noopener"
            title={p.configured ? `Buy via ${p.name}` : `${p.name} — set its env key for pre-filled checkout; opens ${p.name} for now`}
            className={`group relative flex flex-col gap-1 py-3 px-3.5 rounded-lg border-2 transition-all ${
              p.best
                ? "border-vault-primary bg-vault-primary/20 hover:bg-vault-primary/30 shadow-vault"
                : "border-vault-primary/40 bg-vault-primary/10 hover:bg-vault-primary/20 hover:border-vault-primary/70"
            }`}
          >
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className={`text-sm font-bold ${p.best ? "text-vault-primary" : "text-foreground"}`}>{p.name}</span>
                {p.best && (
                  <span className="inline-flex items-center gap-0.5 text-[8px] font-bold uppercase text-background bg-vault-primary rounded px-1 py-0.5">
                    <Star className="w-2 h-2" /> Best
                  </span>
                )}
              </span>
              <span className="inline-flex items-center gap-1">
                {!p.configured && <span className="text-[8px] font-bold uppercase text-vault-primary bg-vault-primary/20 rounded px-1 py-0.5">soon</span>}
                <ExternalLink className="w-3.5 h-3.5 text-vault-primary/80 group-hover:text-vault-primary" />
              </span>
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight">{p.methods}</span>
            <span className={`text-[9px] font-medium inline-flex items-center gap-1 ${p.kycTone === "good" ? "text-emerald-400" : "text-yellow-400/90"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${p.kycTone === "good" ? "bg-emerald-400" : "bg-yellow-400/90"}`} />
              {p.kyc}
            </span>
          </a>
        ))}
      </div>

      <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
        Card / Apple / Google Pay always require at least light KYC (card-network + AML rules). "No-KYC below a limit" varies by country and changes often.
      </p>

      {/* Brand mark — this whole section is a self-contained, reusable
          "engine" (config-driven, prop-driven, env-gated, no backend). The
          footer stamps every render so wherever it's dropped in — or exported
          to another site later — it carries the cyrusthegreat identity. */}
      {!hideBrand && (
        <div className="flex items-center justify-center gap-1 pt-1.5 border-t border-vault-primary/15">
          <Zap className="w-3 h-3 text-vault-primary/70" />
          <span className="text-[9px] text-muted-foreground/60">
            powered by <a href="https://cyrusgate.dev" target="_blank" rel="noreferrer noopener" className="text-vault-primary/90 font-semibold hover:text-vault-primary">CyrusGate</a>
          </span>
        </div>
      )}
    </div>
  );
};
