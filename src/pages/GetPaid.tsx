/**
 * /get-paid — payment-link generator for businesses.
 *
 * "I want to accept anonymous crypto payments from customers" → this page.
 * Business pastes their wallet address + optional preset amount + optional
 * memo template, gets a pre-filled pay-link URL + QR code to share via
 * email, Telegram, WhatsApp, embedded button on their site, etc.
 *
 * Output URL format: cyrusthegreat.dev/pay?to=0x…&amount=N&memo=…
 * (amount is in token-display units, e.g., "25" for 25 USD1 — PayForm
 * matches it to the nearest configured bucket size on arrival).
 *
 * No backend, no DB, no auth. The URL IS the payment link — share it
 * however you want. Same security model as the rest of the dapp: the
 * recipient address is bound into the commitment hash on commit, so a
 * customer who pastes a different address into a tampered link would
 * just pay a different recipient — still anonymous, still MEV-safe,
 * just the wrong destination.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Link2, Copy, Check, ExternalLink } from "lucide-react";
import { ClaimQR } from "@/components/pool/ClaimQR";
import { WEB3_CONFIG } from "@/config/web3";

const GetPaid = () => {
  const navigate = useNavigate();
  const { address: account } = useAccount();

  const [recipient, setRecipient] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!WEB3_CONFIG.ENABLE_POOL) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
          <h1 className="text-xl font-bold mb-2">Pay links unavailable</h1>
          <p className="text-sm text-muted-foreground">
            The privacy-payment feature isn't enabled on this build.
          </p>
        </Card>
      </div>
    );
  }

  const recipientValid = /^0x[a-fA-F0-9]{40}$/.test(recipient);
  const amountValid = !amount || /^\d+(\.\d+)?$/.test(amount);
  const canGenerate = recipientValid && amountValid;

  const handleGenerate = () => {
    if (!canGenerate) return;
    const base = window.location.origin + "/pay";
    const params = new URLSearchParams();
    params.set("to", recipient);
    if (amount) params.set("amount", amount);
    if (memo) params.set("memo", memo.slice(0, 200));
    setGenerated(`${base}?${params.toString()}`);
  };

  const handleCopy = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleReset = () => {
    setGenerated(null);
    setCopied(false);
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
      </Button>

      {/* Header */}
      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-full bg-vault-primary/15">
            <Link2 className="w-5 h-5 text-vault-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Get paid — create a payment link</h1>
            <p className="text-xs text-muted-foreground">Share with customers. Anonymous on-chain. ~1 hr settlement.</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate a link your customers can open, pay, and share the receipt. You'll receive funds at
          the wallet address below. No accounts, no backend — the URL is the whole thing.
        </p>
      </Card>

      {!generated ? (
        <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-5">
          {/* Recipient (you) */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Your wallet address (where funds land)</Label>
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
            <p className="text-xs text-muted-foreground">
              This address gets baked into every payment made via the link — payers can't redirect
              funds elsewhere (MEV-safe).
            </p>
          </div>

          {/* Amount (optional) */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Amount (optional)</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25"
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty if customer picks. Otherwise enter a number — pay form will match it to the
              closest fixed bucket size. Use whole numbers for stables (e.g., <code className="font-mono text-[10px]">25</code> = 25 USD1),
              decimals for native (e.g., <code className="font-mono text-[10px]">0.01</code> = 0.01 ETH).
            </p>
          </div>

          {/* Memo (optional) */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Memo / note (optional)</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value.slice(0, 200))}
              placeholder="Invoice #1234 · service description · customer ID"
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground/70 text-right">{memo.length} / 200</p>
            <p className="text-xs text-muted-foreground">
              Pre-fills the customer's memo field. They can edit before paying. Useful for invoice
              numbers / customer IDs / order references — shows up in the receipt URL.
            </p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full bg-vault-primary text-background hover:bg-vault-primary/90"
          >
            {!recipient ? "Enter your wallet address" :
              !recipientValid ? "Invalid wallet address" :
              !amountValid ? "Invalid amount" :
              "Generate payment link"}
          </Button>
        </Card>
      ) : (
        <Card className="p-6 bg-emerald-500/5 border-emerald-500/30 space-y-4">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-200">Your payment link is ready</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Share this URL with your customer</Label>
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
              Preview what customer sees <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start pt-2 border-t border-emerald-500/20">
            <ClaimQR value={generated} size={160} />
            <div className="text-xs text-muted-foreground space-y-1.5 sm:flex-1">
              <p>
                <strong className="text-foreground">QR for in-person sharing</strong> — customer scans
                with their phone, opens the pay form pre-filled.
              </p>
              <p>
                <strong className="text-foreground">URL for digital sharing</strong> — paste in
                Telegram, WhatsApp, email, Signal, or embed as a "Pay now" button on your website.
              </p>
              <p className="text-yellow-200/80">
                ⚠ Share via end-to-end encrypted channels for high-value flows. Public sharing
                (Twitter, Discord) is fine for tip jars / low-stakes payments — no security risk,
                just less private about WHO is paying.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleReset}
            className="w-full text-xs"
          >
            Create another link
          </Button>
        </Card>
      )}
    </div>
  );
};

export default GetPaid;
