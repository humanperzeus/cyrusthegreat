/**
 * /get-embed — snippet generator for the "engine by cyrusthegreat" onramp.
 *
 * Configure (optional deliver-to wallet, amount, token) → get a copy-paste
 * STATIC <iframe> that renders the onramp engine on any site. Static iframe
 * (not a loader script) is deliberate: inert, no white-flash, framable, and
 * the branded engine carries "engine by cyrusthegreat" back to us on every
 * host — a built-in attribution / growth loop.
 *
 * Live preview is the real /embed/onramp route in an iframe, so what you see
 * is exactly what the host gets.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeo } from "@/hooks/useSeo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Code2, Copy, Check } from "lucide-react";

const EmbedBuilder = () => {
  useSeo({
    title: "Embed a crypto pay & buy widget — cyrusthegreat.dev",
    description: "Generate an embeddable, self-custodial crypto pay/buy widget for your site — copy-paste iframe snippet.",
    path: "/get-embed",
  });
  const navigate = useNavigate();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("USDC");
  const [copied, setCopied] = useState(false);

  const recipientValid = !recipient || /^0x[a-fA-F0-9]{40}$/.test(recipient);

  const embedUrl = (() => {
    const p = new URLSearchParams();
    if (recipient && recipientValid) p.set("to", recipient);
    if (amount) p.set("amount", amount);
    if (token) p.set("token", token);
    const qs = p.toString();
    return `${window.location.origin}/embed/onramp${qs ? `?${qs}` : ""}`;
  })();

  const snippet =
    `<iframe src="${embedUrl}" width="460" height="420" ` +
    `style="border:0;border-radius:12px;max-width:100%" ` +
    `title="Buy crypto — engine by cyrusthegreat" loading="lazy"></iframe>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to vault
      </Button>

      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-full bg-vault-primary/15">
            <Code2 className="w-5 h-5 text-vault-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Embed the onramp engine</h1>
            <p className="text-xs text-muted-foreground">Drop a "buy crypto" widget on any site with one line.</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Paste the generated <code className="text-vault-primary text-xs">&lt;iframe&gt;</code> into any website. It renders the
          multi-provider onramp (Apple Pay / Google Pay / card) and carries the <span className="text-vault-primary">engine by cyrusthegreat</span> mark.
        </p>
      </Card>

      <Card className="p-6 bg-gradient-card backdrop-blur border-vault-primary/30 space-y-5">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Deliver-to wallet (optional)</Label>
          <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x… (leave empty — buyer enters their own)" className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">
            Empty = the buyer types their own wallet in the provider (a general "buy crypto" widget). Set it to a fixed address for a "tip me / fund me" widget.
          </p>
          {!recipientValid && <p className="text-xs text-red-400">Invalid wallet address.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Amount hint (optional)</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="25" className="text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Token</Label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="USDC" className="text-sm" />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Copy this into your site</Label>
          <div className="relative">
            <pre className="text-[10px] font-mono bg-background/40 border border-vault-primary/20 rounded-md p-3 pr-10 overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">{snippet}</pre>
            <Button size="sm" variant="outline" onClick={handleCopy} className="absolute top-2 right-2 h-7">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Live preview (the real embed)</Label>
          <div className="rounded-md border border-vault-primary/15 bg-background/20 p-2 flex justify-center">
            <iframe src={embedUrl} width={460} height={420} style={{ border: 0, borderRadius: 12, maxWidth: "100%" }} title="Onramp preview" />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default EmbedBuilder;
