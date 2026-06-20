/**
 * /fundraise — donation-campaign generator (FundMe-style).
 *
 * Sibling to /get-paid. Same underlying primitive (CyrusTeleport
 * commit-reveal → recipient address gets the funds) but framed for
 * collecting donations to a cause rather than receiving invoiced
 * payments.
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
 * Why /fund vs /pay for the donor side: campaign pages need extra
 * framing (title hero, optional progress bar against goal,
 * description copy). /pay is for transactional one-off payments;
 * /fund is for campaigns with a story.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useChainId } from "wagmi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, HeartHandshake, Copy, Check, ExternalLink } from "lucide-react";
import { ClaimQR } from "@/components/pool/ClaimQR";
import { WEB3_CONFIG } from "@/config/web3";
import { POOL_TOKENS_BY_CHAIN, NATIVE_TOKEN_ADDRESS } from "@/hooks/usePool";
import { WalletConnector } from "@/components/WalletConnector";

const Fundraise = () => {
  const navigate = useNavigate();
  const { address: account } = useAccount();
  const walletChainId = useChainId();
  const chainForTokens = walletChainId ?? 11155111;
  const availableTokens = POOL_TOKENS_BY_CHAIN[chainForTokens] ?? POOL_TOKENS_BY_CHAIN[11155111] ?? [];

  const [recipient, setRecipient] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const defaultTokenSymbol =
    (availableTokens.find(t => t.address !== NATIVE_TOKEN_ADDRESS)?.symbol)
    ?? availableTokens[0]?.symbol
    ?? "USD1";
  const [tokenSymbol, setTokenSymbol] = useState<string>(defaultTokenSymbol);
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const handleGenerate = () => {
    if (!canGenerate) return;
    const base = window.location.origin + "/fund";
    const params = new URLSearchParams();
    params.set("to", recipient);
    params.set("title", title.slice(0, 80));
    if (description) params.set("desc", description.slice(0, 300));
    if (goal) params.set("goal", goal);
    if (tokenSymbol) params.set("token", tokenSymbol);
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
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
      </Button>

      <Card className="p-4 bg-gradient-card backdrop-blur border-vault-primary/30">
        <WalletConnector />
      </Card>

      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-full bg-vault-primary/15">
            <HeartHandshake className="w-5 h-5 text-vault-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Fundraise — create a donation page</h1>
            <p className="text-xs text-muted-foreground">Anonymous donations. No platform cut. Share the link anywhere.</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Donors land on your campaign page, pick an amount, donate via the privacy pool. Funds arrive
          at the wallet below. ~1 hour settlement per donation.
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
              {account && account !== recipient && (
                <Button type="button" variant="outline" size="sm" onClick={() => setRecipient(account)} className="whitespace-nowrap">
                  Use connected wallet
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
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Goal (optional)</Label>
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="1000"
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Just a display target on your campaign page ("Goal: 1000 {tokenSymbol}"). Doesn't gate
              anything on-chain — donors can give any of the supported bucket amounts.
            </p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full bg-vault-primary text-background hover:bg-vault-primary/90"
          >
            {!recipient ? "Enter your wallet address" :
              !recipientValid ? "Invalid wallet address" :
              !titleValid ? "Add a campaign title" :
              !goalValid ? "Invalid goal amount" :
              "Generate campaign page"}
          </Button>
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
