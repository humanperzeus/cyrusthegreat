/**
 * /privacy — Privacy Policy.
 *
 * Written from what the app ACTUALLY does (§5 claims-sweep): no accounts,
 * no server-side user data, no analytics, no ad trackers. Self-custodial
 * testnet dapp. Keep this honest — every claim here is verifiable against
 * the codebase. If a data flow changes (e.g. a real fiat on-ramp goes
 * live, or analytics is added), this file MUST be updated in the same PR.
 *
 * Testnet-only framing is deliberate: the app touches no mainnet contracts
 * and no real funds, which materially reduces what's at stake for a
 * visitor. Say so up front.
 *
 * SEO: per-page <title> + meta description set via a tiny effect (no
 * react-helmet dependency). Google renders SPA JS so this is indexed.
 *
 * Contact mailbox: human@cyrusthegreat.dev (Cloudflare Email Routing
 * forward). GDPR needs a working channel for data-subject requests.
 */

import { useSeo } from "@/hooks/useSeo";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

const CONTACT = "human@cyrusthegreat.dev";

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-foreground text-base font-medium mt-8 mb-2">{children}</h2>
);

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-vault-primary hover:underline">
    {children}
  </a>
);

const Privacy = () => {
  useSeo({
    title: "Privacy Policy — cyrusthegreat.dev",
    description: "Privacy policy for cyrusthegreat.dev — a self-custodial multi-chain testnet dapp. No accounts, no analytics, no tracking. What is processed and by whom.",
    path: "/privacy",
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-muted-foreground text-sm leading-relaxed">
      <Link to="/" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back to cyrusthegreat.dev
      </Link>

      <h1 className="text-2xl text-foreground font-bold mb-1">Privacy Policy</h1>
      <p className="text-xs text-muted-foreground/70 mb-6">Last updated: July 2026</p>

      <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 mb-6">
        <p className="text-xs text-yellow-200/90">
          <strong>Testnet only.</strong> cyrusthegreat.dev currently runs on public test networks. No real
          funds and no mainnet contracts are involved. This reduces what is at stake, but the privacy
          practices below apply regardless.
        </p>
      </div>

      <p>
        cyrusthegreat.dev is a <span className="text-foreground">self-custodial</span> multi-chain crypto
        interface. It is built to need as little of your data as possible. There are no user accounts, and
        we do not track, profile, advertise to, or sell data about you.
      </p>

      <H>What we do NOT do</H>
      <ul className="list-disc pl-5 space-y-1">
        <li>No advertising or marketing cookies, no analytics (Google Analytics, Meta Pixel, etc.), no cross-site tracking.</li>
        <li>No user accounts, no email/password sign-up, no behavioural profiling.</li>
        <li>No custody of your funds or private keys — the app never sees them (see the <Link to="/disclaimer" className="text-vault-primary hover:underline">Disclaimer</Link>).</li>
        <li>No selling, renting, or sharing of personal data.</li>
      </ul>

      <H>What is processed, and by whom</H>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <span className="text-foreground">Connection data (IP address, request metadata)</span> — processed
          transiently by our hosting/CDN provider <A href="https://www.cloudflare.com/privacypolicy/">Cloudflare</A> to
          serve the site and protect it against attacks (bot filtering, rate limiting). Cloudflare may set
          strictly-necessary security cookies.
        </li>
        <li>
          <span className="text-foreground">Your wallet address &amp; on-chain activity</span> — when you connect a
          wallet, the connection is handled client-side via <A href="https://reown.com/privacy-policy">Reown / WalletConnect</A> and
          your wallet software. Anything you submit to a blockchain (deposits, payments, commitments) is
          <span className="text-foreground"> public by nature</span> on that network. We do not add to or store this beyond your own browser.
        </li>
        <li>
          <span className="text-foreground">Blockchain RPC requests</span> — to read balances and broadcast
          transactions, your browser talks to third-party RPC providers (e.g. Alchemy, dRPC, and public node
          endpoints). These providers may see your IP and the addresses you query, under their own policies.
        </li>
        <li>
          <span className="text-foreground">Local browser storage</span> — functional values kept in <em>your</em> browser
          only: your privacy-pool "notebook" (the secret needed to later claim a commitment), your selected
          network mode, and UI preferences. <span className="text-foreground">These never reach a server we control.</span> Clearing
          your browser data deletes them — including any un-claimed pool secrets, which cannot then be recovered.
        </li>
      </ul>

      <H>Legal basis (GDPR)</H>
      <p>
        Processing of connection data rests on our legitimate interest (Art. 6(1)(f) GDPR) in operating a
        functional and secure website. Any interaction with your wallet or a blockchain rests on performing
        the service you requested (Art. 6(1)(b) GDPR). We do not hold account data.
      </p>

      <H>Your rights</H>
      <p>
        Under the GDPR you may request access to, correction, or deletion of your personal data, restrict or
        object to its processing, and lodge a complaint with a data-protection supervisory authority. Because
        we hold no account data, most requests concern only transient logs held by the processors above, or
        data that lives solely in your own browser.
      </p>

      <H>Children</H>
      <p>
        This site is not directed to children. You must be at least 18 years old (or the age of majority where
        you live) to use it.
      </p>

      <H>Changes to this policy</H>
      <p>
        We may update this policy from time to time. The "last updated" date above reflects the current version.
      </p>

      <H>Contact</H>
      <p>
        Questions about this policy or your data: <a href={`mailto:${CONTACT}`} className="text-vault-primary hover:underline">{CONTACT}</a>.
      </p>

      <p className="text-xs text-muted-foreground/50 mt-10">
        This document is provided for transparency and is not legal advice.
      </p>
    </div>
  );
};

export default Privacy;
