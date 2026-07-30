/**
 * BuildBadge — corner pill that shows the live app VERSION + build time.
 *
 * Mounted at App level so it appears on every route (/, /claim, /debug,
 * 404). Position is bottom-LEFT on purpose — bottom-RIGHT is taken by
 * the ProgressFlow chip stack, and we don't want a build pill colliding
 * with an in-flight tx chip.
 *
 * Reads at a glance: `v1.15.3 · 2026-07-05 18:26:57 UTC+2`.
 *   - version FIRST (the number you actually track), in gold
 *   - build time as YYYY-MM-DD HH:MM:SS in the VIEWER's local timezone
 *   - explicit local UTC-offset label so it's never ambiguous whose
 *     timezone this is (the previous badge showed a raw ...Z ISO string,
 *     which read as UTC and confused "is this my time?")
 * The git SHA moves to the tooltip + copy payload (still there for bug
 * reports, just not cluttering the pill).
 *
 * Values are baked in at build time by vite.config.ts's `define` block.
 * No runtime git lookup. On Cloudflare Pages the deploy runner has the
 * repo checked out, so __BUILD_SHA__ === the actual deployed commit.
 */

import { useEffect, useState } from "react";

const pad = (n: number) => n.toString().padStart(2, "0");

/** YYYY-MM-DD HH:MM:SS in the viewer's local timezone. */
const formatBuildTime = (iso: string): string => {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return (
      d.getFullYear() +
      "-" + pad(d.getMonth() + 1) +
      "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) +
      ":" + pad(d.getMinutes()) +
      ":" + pad(d.getSeconds())
    );
  } catch {
    return iso;
  }
};

/** Viewer's local UTC offset, e.g. "UTC+2" / "UTC-5:30". */
const localTzLabel = (): string => {
  // getTimezoneOffset() is minutes BEHIND UTC (negative = ahead of UTC).
  const offMin = -new Date().getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ":" + pad(m) : ""}`;
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

  const localTime = formatBuildTime(__BUILD_TIME__);
  const tz = localTzLabel();

  const handleClick = async () => {
    try {
      // Copy the full detail — version, sha, local build time + tz, and
      // the raw UTC ISO — everything a bug report needs.
      await navigator.clipboard.writeText(
        `v${__APP_VERSION__} · ${__BUILD_SHA__} · ${localTime} ${tz} · ${__BUILD_TIME__}`,
      );
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
      title={`Version v${__APP_VERSION__}\nCommit ${__BUILD_SHA__}\nBuilt ${localTime} ${tz} (your local time)\nUTC ${__BUILD_TIME__}\nClick to copy`}
      className="fixed bottom-3 left-3 z-40 px-2 py-1 rounded-md text-[10px] font-mono leading-none border bg-gradient-card border-vault-primary/30 text-vault-primary/70 hover:text-vault-primary hover:border-vault-primary/60 transition-colors opacity-60 hover:opacity-100"
    >
      {copied
        ? "copied"
        : (
          <>
            <span className="text-vault-primary font-semibold">v{__APP_VERSION__}</span>
            <span className="text-muted-foreground"> · {localTime} {tz}</span>
          </>
        )}
    </button>
  );
};
