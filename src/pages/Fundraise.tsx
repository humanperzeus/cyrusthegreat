/**
 * /fundraise — donation-campaign generator (FundMe-style).
 *
 * Generates campaign URLs for /fund. Donations on the /fund page are
 * DIRECT ERC-20 transfers to the campaign's recipient wallet — public
 * on-chain, instant, no claim-URL responsibility. Donors who want
 * anonymity should be pointed to /pay (CyrusTeleport pool) instead;
 * this page is for public campaigns where reliable fund arrival is
 * more important than donor privacy.
 *
 * Form inputs:
 *   - Recipient wallet (you / the cause's wallet)
 *   - Campaign title (required, ≤ 80 chars)
 *   - Description (optional, ≤ 300 chars)
 *   - Goal amount (optional — displayed as a target on the /fund page)
 *   - Default token (USD1 today; USDC/USDT when configured per chain)
 *
 * Output: a /fund?to=…&title=…&desc=…&goal=…&token=… URL + QR.
 *
 * No backend. No DB. URL is the campaign. Same pattern as /get-paid.
 *
 * Why /fund vs /pay for the donor side: /fund uses public direct
 * transfers (no anonymity, no URL risk) which is what people expect
 * from a "donate now" button. /pay uses the privacy pool with explicit
 * URL responsibility — for invoiced P2P payments where sender + receiver
 * can share the URL over a side channel.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeo } from "@/hooks/useSeo";
import { useAccount, useChainId } from "wagmi";
import { parseUnits, type Address } from "viem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, HeartHandshake, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { ClaimQR } from "@/components/pool/ClaimQR";
import { WEB3_CONFIG } from "@/config/web3";
import { POOL_TOKENS_BY_CHAIN, NATIVE_TOKEN_ADDRESS } from "@/hooks/usePool";
import { useConnectWallet } from "@/hooks/useConnectWallet";
import { useFundraise } from "@/hooks/useFundraise";
import { WalletStatusChip } from "@/components/shared/WalletStatusChip";

const Fundraise = () => {
  useSeo({
    title: "Fundraise in crypto — non-custodial campaigns — cyrusthegreat.dev",
    description: "Launch a non-custodial crypto fundraiser with live on-chain progress. Funds go straight to your wallet; 0.1% protocol fee.",
    path: "/fundraise",
  });
  const navigate = useNavigate();
  const { address: account } = useAccount();
  const connectWallet = useConnectWallet();
  const walletChainId = useChainId();
  // /fund only supports ERC-20 direct transfers in v1 — native ETH/BNB
  // donations aren't tracked by the progress bar (no Transfer events
  // for native), so filter native out of the picker.
  const chainForTokens = walletChainId ?? 11155111;
  const availableTokensAll = POOL_TOKENS_BY_CHAIN[chainForTokens] ?? POOL_TOKENS_BY_CHAIN[11155111] ?? [];
  const availableTokens = availableTokensAll.filter(t => t.address !== NATIVE_TOKEN_ADDRESS);

  const [recipient, setRecipient] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const defaultTokenSymbol = availableTokens[0]?.symbol ?? "USD1";
  const [tokenSymbol, setTokenSymbol] = useState<string>(defaultTokenSymbol);
  // Mode policy controls which donation paths /fund offers to donors.
  // 'optional' (default) shows both Public + Anonymous with Public selected.
  // 'required' forces Anonymous-only (privacy-focused causes).
  // 'disabled' forces Public-only (causes that explicitly need transparency
  //  e.g., regulated charities filing 501(c)(3) donor reports).
  const [anonPolicy, setAnonPolicy] = useState<'optional' | 'required' | 'disabled'>('optional');
  // Opt-in: list this campaign in the public /discover directory. Default OFF
  // (privacy-respecting) — the campaign is invisible there until you check it.
  const [listed, setListed] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // When the fundraise contract is live on this chain, "create" mints an
  // on-chain campaign (id-based, accurate progress). Otherwise fall back to
  // a legacy ?to= link (no id, explorer-based progress).
  const { createCampaign, contractAddress: fundraiseContract } = useFundraise();
  const contractMode = !!fundraiseContract;

  if (!WEB3_CONFIG.ENABLE_POOL) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
          <h1 className="text-xl font-bold mb-2">Fundraising unavailable</h1>
          <p className="text-sm text-muted-foreground">
            The privacy-payment feature isn't enabled on this build.
          </p>
        </Card>
      </div>
    );
  }

  const recipientValid = /^0x[a-fA-F0-9]{40}$/.test(recipient);
  const titleValid = title.trim().length > 0 && title.length <= 80;
  const goalValid = !goal || /^\d+(\.\d+)?$/.test(goal);
  const canGenerate = recipientValid && titleValid && goalValid;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    const base = window.location.origin + "/fund";
    const tokenEntry = availableTokens.find(t => t.symbol === tokenSymbol);

    // Contract mode: mint the campaign on-chain (one small tx), then build a
    // ?id= URL. Requires a connected wallet (the creator pays gas).
    if (contractMode && tokenEntry) {
      if (!account) { connectWallet(); return; }
      setCreating(true);
      setCreateError(null);
      try {
        const goalWei = goal ? parseUnits(goal, tokenEntry.decimals) : 0n;
        const { id } = await createCampaign({
          recipient: recipient as Address,
          token: tokenEntry.address as Address,
          goalWei,
          title: title.slice(0, 80),
          listed,
        });
        const params = new URLSearchParams();
        params.set("id", String(id));
        params.set("title", title.slice(0, 80));
        if (description) params.set("desc", description.slice(0, 300));
        if (anonPolicy !== 'optional') params.set("anon", anonPolicy);
        setGenerated(`${base}?${params.toString()}`);
      } catch (e: unknown) {
        setCreateError(e instanceof Error ? e.message : String(e));
      } finally {
        setCreating(false);
      }
      return;
    }

    // Legacy fallback (chain without the fundraise contract): ?to= link.
    const params = new URLSearchParams();
    params.set("to", recipient);
    params.set("title", title.slice(0, 80));
    if (description) params.set("desc", description.slice(0, 300));
    if (goal) params.set("goal", goal);
    if (tokenSymbol) params.set("token", tokenSymbol);
    if (anonPolicy !== 'optional') params.set("anon", anonPolicy);
    setGenerated(`${base}?${params.toString()}`);
  };

  const handleCopy = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleReset = () => { setGenerated(null); setCopied(false); };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
        </Button>
        <WalletStatusChip />
      </div>

      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-full bg-vault-primary/15">
            <HeartHandshake className="w-5 h-5 text-vault-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Fundraise — create a donation page</h1>
            <p className="text-xs text-muted-foreground">Public or anonymous donations. Donor picks. Public takes a 0.1% fee (min $0.10).</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Donors land on your campaign page and choose between <strong className="text-foreground">Public</strong> (instant, on-chain visible) or <strong className="text-foreground">Anonymous</strong> (via privacy pool, donor must claim ~1h later).
          You control which modes are available below.
        </p>
      </Card>

      {!generated ? (
        <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-5">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Your wallet address (where donations land)</Label>
            <div className="flex gap-2">
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x… (your wallet)"
                className="font-mono text-xs"
              />
              {account ? (
                account !== recipient && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setRecipient(account)} className="whitespace-nowrap">
                    Use my wallet
                  </Button>
                )
              ) : (
                <Button type="button" size="sm" onClick={connectWallet} className="whitespace-nowrap bg-gradient-vault text-primary-foreground shadow-vault hover:opacity-90">
                  Connect wallet
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Campaign title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="Help fund my open-source library / Medical bills / etc."
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground/70 text-right">{title.length} / 80</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 300))}
              placeholder="What's the cause? Why should people donate?"
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground/70 text-right">{description.length} / 300</p>
          </div>

          {availableTokens.length > 1 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Donation token</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {availableTokens.map((t) => (
                  <button
                    key={t.address}
                    type="button"
                    onClick={() => setTokenSymbol(t.symbol)}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
                      tokenSymbol === t.symbol
                        ? "bg-vault-primary/20 border-vault-primary/60 text-vault-primary"
                        : "bg-vault-primary/5 border-vault-primary/20 text-muted-foreground hover:border-vault-primary/40"
                    }`}
                  >
                    {t.symbol}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Donor anonymity options</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'optional', label: 'Both modes', hint: 'Donor picks (default Public)' },
                { key: 'disabled', label: 'Public only', hint: 'No anonymous donations' },
                { key: 'required', label: 'Anonymous only', hint: 'Privacy-first cause' },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setAnonPolicy(opt.key)}
                  className={`text-left rounded-md px-3 py-2 border transition-colors ${
                    anonPolicy === opt.key
                      ? 'bg-vault-primary/20 border-vault-primary/60 text-vault-primary'
                      : 'bg-vault-primary/5 border-vault-primary/20 text-muted-foreground hover:border-vault-primary/40'
                  }`}
                >
                  <div className="text-xs font-medium">{opt.label}</div>
                  <div className="text-[10px] text-muted-foreground/80 leading-tight mt-0.5">{opt.hint}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Anonymous donations require the donor to broadcast the claim ~1h after donating. Public = standard on-chain transfer.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Goal (optional)</Label>
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="1000"
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Just a display target on your campaign page ("Goal: 1000 {tokenSymbol}"). Doesn't gate
              anything on-chain — donors can give any amount.
            </p>
          </div>

          {/* Opt-in public directory listing — only in contract mode. */}
          {contractMode && (
            <label className="flex items-start gap-2 cursor-pointer px-3 py-2 rounded-md border border-vault-primary/20 bg-vault-primary/5">
              <input
                type="checkbox"
                checked={listed}
                onChange={(e) => setListed(e.target.checked)}
                className="mt-0.5 accent-vault-primary"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">List in the public directory</span> — show this campaign on <a href="/discover" className="text-vault-primary hover:underline">/discover</a> so anyone can find it. Off by default. You can change it later. (Your campaign is on-chain either way; this only controls directory visibility.)
              </span>
            </label>
          )}

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || creating}
            className="w-full bg-vault-primary text-background hover:bg-vault-primary/90"
          >
            {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating campaign on-chain…</> :
              !recipient ? "Enter your wallet address" :
              !recipientValid ? "Invalid wallet address" :
              !titleValid ? "Add a campaign title" :
              !goalValid ? "Invalid goal amount" :
              contractMode ? (account ? "Create campaign on-chain" : "Connect wallet to create") :
              "Generate campaign page"}
          </Button>
          {contractMode && (
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              Creates an on-chain campaign (one small tx you sign) so donations get a real id + an exact live total. Public donations take a 0.1% fee (min $0.10).
            </p>
          )}
          {createError && (
            <p className="text-xs text-red-400 font-mono whitespace-pre-wrap">{createError}</p>
          )}
        </Card>
      ) : (
        <Card className="p-6 bg-emerald-500/5 border-emerald-500/30 space-y-4">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-200">Your campaign page is ready</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Share this URL anywhere</Label>
            <div className="flex gap-2">
              <Input value={generated} readOnly className="font-mono text-xs flex-1" />
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <a
              href={generated}
              target="_blank" rel="noreferrer noopener"
              className="text-xs text-vault-primary hover:underline inline-flex items-center gap-1"
            >
              Preview campaign page <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start pt-2 border-t border-emerald-500/20">
            <ClaimQR value={generated} size={160} />
            <div className="text-xs text-muted-foreground space-y-1.5 sm:flex-1">
              <p>
                <strong className="text-foreground">QR for stickers / posters / in-person sharing.</strong> Donors scan
                with their phone, land on your campaign page.
              </p>
              <p>
                <strong className="text-foreground">URL for digital sharing.</strong> Twitter, Discord, your blog, your
                README, in-bio link, email signature.
              </p>
              <p className="text-yellow-200/80">
                ⚠ Anyone with the URL can donate to YOUR address. The URL is safe to share publicly — donations
                go to you, not whoever holds the URL.
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={handleReset} className="w-full text-xs">
            Create another campaign
          </Button>
        </Card>
      )}
    </div>
  );
};

export default Fundraise;
