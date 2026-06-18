/**
 * BuildBadge — corner pill that shows the live build SHA + timestamp.
 *
 * Mounted at App level so it appears on every route (/, /claim, /debug,
 * 404). Position is bottom-LEFT on purpose — bottom-RIGHT is taken by
 * the ProgressFlow chip stack, and we don't want a build pill colliding
 * with an in-flight tx chip.
 *
 * Click copies "sha · iso-timestamp" to the clipboard for easy bug
 * reporting ("I'm seeing this on 974bd49 · 2026-06-12T11:56").
 *
 * Values are baked in at build time by vite.config.ts's `define` block.
 * No runtime git lookup. On Cloudflare Pages the deploy runner has the
 * repo checked out, so __BUILD_SHA__ === the actual deployed commit.
 */

import { useEffect, useState } from "react";

const formatBuildTime = (iso: string): string => {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // YYYY-MM-DD HH:MM in the viewer's local tz — what most "is this the
    // new build?" checks actually need (you remember WHEN you pushed,
    // not the UTC hour).
    const pad = (n: number) => n.toString().padStart(2, "0");
    return (
      d.getFullYear() +
      "-" + pad(d.getMonth() + 1) +
      "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) +
      ":" + pad(d.getMinutes())
    );
  } catch {
    return iso;
  }
};

export const BuildBadge = () => {
  const [copied, setCopied] = useState(false);

  // Auto-clear the "copied" feedback after 1.5s so the badge returns to
  // its quiet baseline.
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(`${__BUILD_SHA__} · ${__BUILD_TIME__}`);
      setCopied(true);
    } catch {
      // Clipboard API can fail (insecure context, denied permission);
      // silently no-op — the badge text itself is readable.
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Copy build identifier to clipboard"
      title={`Build ${__BUILD_SHA__} · ${__BUILD_TIME__}\nClick to copy`}
      className="fixed bottom-3 left-3 z-40 px-2 py-1 rounded-md text-[10px] font-mono leading-none border bg-gradient-card border-vault-primary/30 text-vault-primary/70 hover:text-vault-primary hover:border-vault-primary/60 transition-colors opacity-60 hover:opacity-100"
    >
      {copied
        ? "copied"
        : <>{__BUILD_SHA__} · <span className="text-muted-foreground">{formatBuildTime(__BUILD_TIME__)}</span></>}
    </button>
  );
};
