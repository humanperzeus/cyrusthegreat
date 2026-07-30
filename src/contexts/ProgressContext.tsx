/**
 * ProgressContext — App-level registry of in-flight progress sessions.
 *
 * Each multi-X or single-asset submit opens its own ProgressSession with
 * a unique id. Multiple sessions coexist: start a Sepolia multi-token
 * deposit, then a Base single-asset transfer — both are visible. The
 * most-recent submit is the centered modal; older sessions are corner
 * chips, stacked vertically.
 *
 * Why this matters (2026-06-12, after the W4 chip-during-close fix
 * landed and the single-session walk-back from 2026-06-10 was undone):
 *
 *   The single-session model lost user context. A second submit
 *   replaced the first session's state; the older tx was still in
 *   flight on-chain but had vanished from the UI. The user couldn't
 *   tell which signature the wallet was prompting for.
 *
 *   The honest UI matches reality: every submit is its own session
 *   until its terminal state is reached or the user closes it.
 *
 * Display rules:
 *   • At most ONE session is "expanded" (centered modal). Starting a
 *     new session expands it and minimizes whatever was expanded
 *     before. Clicking a chip body expands that session.
 *   • All other sessions render as chips in the bottom-right. Most
 *     recent at the corner (chipIndex 0), older chips stacked upward.
 *   • Body scroll is locked iff something is expanded. Provider-owned
 *     so the multiple ProgressFlow instances can't race on
 *     document.body.style.overflow.
 *   • Terminal sessions (all-done OR any-failed) auto-close 30s after
 *     reaching that state. User can Close earlier to dismiss now.
 *     The underlying tx is NOT cancelled by closing — the wallet's
 *     pending tx still resolves on-chain; we just stop tracking it.
 *
 * Submit-handler pattern (with the W4 chip-during-close timing):
 *   const id = startProgress(title, [{label, status:'running'}]);
 *   expandProgress(null);                                  // 0ms — collapse to chip
 *   onOpenChange(false);                                   // Radix runs its 200ms close
 *   setTimeout(() => expandProgress(id), 250);             // re-expand THIS session
 *   doTheTx({ onProgress: steps => updateProgress(id, steps) });
 *
 *   The 0ms collapse keeps the ProgressFlow rendered as a corner chip
 *   while the parent Radix Dialog runs its exit animation, so the two
 *   cards never overlap. The re-expand fires AFTER the Radix dialog
 *   has fully unmounted (250 > 200ms close window), bringing the new
 *   session forward as the centered modal.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ProgressFlow, ProgressStep } from "@/components/shared/ProgressFlow";

interface ProgressSession {
  id: string;
  title: string;
  steps: ProgressStep[];
  // Latched the first time the session reaches terminal state (all
  // done or any failed); drives the 30s auto-close. null while still
  // in flight. Later detail-line edits must NOT restart this clock.
  terminalAt: number | null;
}

interface ProgressContextValue {
  // True iff ANY session has not yet reached terminal state. Kept on
  // the API for parity with prior multi-X disable semantics; no current
  // call site reads it (the wallet's signature queue is the real
  // serializer), but it's cheap to derive and a future "block while
  // pending" toggle wants it ready.
  active: boolean;
  // Returns the new session id so subsequent updateProgress(id, …)
  // calls scope cleanly across concurrent submits.
  startProgress: (title: string, initialSteps: ProgressStep[]) => string;
  // No-op if id is no longer in the array (session already closed).
  updateProgress: (id: string, steps: ProgressStep[]) => void;
  // Removes one session. If it was expanded, expandedId becomes null.
  closeProgress: (id: string) => void;
  // Sets which session is the centered modal. Passing null collapses
  // everything to chips. Unknown id is a no-op (don't throw).
  expandProgress: (id: string | null) => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

// Auto-close delay for terminal sessions — long enough to read the
// final tx hash + block number; Close dismisses earlier.
const AUTO_CLOSE_MS = 30_000;

// Monotonic id generator. The Date.now() suffix keeps logs readable
// across hot-reloads (which reset __pfCounter to 0).
let __pfCounter = 0;
const genId = () => `pf_${++__pfCounter}_${Date.now()}`;

const isTerminal = (steps: ProgressStep[]): boolean => {
  if (steps.length === 0) return false;
  if (steps.some(s => s.status === "failed")) return true;
  return steps.every(s => s.status === "done");
};

export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<ProgressSession[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const startProgress = useCallback((title: string, initialSteps: ProgressStep[]): string => {
    const id = genId();
    setSessions(prev => [...prev, { id, title, steps: initialSteps, terminalAt: null }]);
    setExpandedId(id);
    return id;
  }, []);

  const updateProgress = useCallback((id: string, steps: ProgressStep[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== id) return s;
      // Latch terminalAt on first terminal observation — subsequent
      // updates (tx-hash fills, block-number reveals) must not reset
      // the auto-close clock.
      const terminalAt = s.terminalAt ?? (isTerminal(steps) ? Date.now() : null);
      return { ...s, steps, terminalAt };
    }));
  }, []);

  const closeProgress = useCallback((id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    setExpandedId(prev => (prev === id ? null : prev));
  }, []);

  const expandProgress = useCallback((id: string | null) => {
    setExpandedId(id);
  }, []);

  // Auto-close terminal sessions after AUTO_CLOSE_MS. Polled every 2s —
  // precision doesn't matter here. Applies in both expanded and chip
  // modes; the toast already provides a lasting record of the outcome.
  useEffect(() => {
    if (sessions.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const expiredIds = new Set<string>();
      for (const s of sessions) {
        if (s.terminalAt !== null && now - s.terminalAt > AUTO_CLOSE_MS) {
          expiredIds.add(s.id);
        }
      }
      if (expiredIds.size === 0) return;
      setSessions(prev => prev.filter(s => !expiredIds.has(s.id)));
      setExpandedId(prev => (prev !== null && expiredIds.has(prev) ? null : prev));
    }, 2000);
    return () => clearInterval(interval);
  }, [sessions]);

  // Body scroll lock — provider-owned so the multiple ProgressFlow
  // instances can't fight over document.body.style.overflow. Locked
  // iff something is expanded; chips don't block page interaction.
  useEffect(() => {
    if (expandedId === null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [expandedId]);

  // Chip stack indices — among the non-expanded sessions, assign 0 to
  // the most recent (sits at the corner), 1 above it, etc. The
  // expanded session is centered and doesn't participate.
  const chips = sessions.filter(s => s.id !== expandedId);
  const chipIndexFor = (id: string): number => {
    const ix = chips.findIndex(s => s.id === id);
    return ix < 0 ? 0 : chips.length - 1 - ix;
  };

  const active = sessions.some(s => s.terminalAt === null);

  return (
    <ProgressContext.Provider
      value={{ active, startProgress, updateProgress, closeProgress, expandProgress }}
    >
      {children}
      {sessions.map(s => {
        const expanded = s.id === expandedId;
        return (
          <ProgressFlow
            key={s.id}
            title={s.title}
            steps={s.steps}
            expanded={expanded}
            chipIndex={expanded ? 0 : chipIndexFor(s.id)}
            onExpand={() => setExpandedId(s.id)}
            onMinimize={() => setExpandedId(prev => (prev === s.id ? null : prev))}
            onClose={() => closeProgress(s.id)}
          />
        );
      })}
    </ProgressContext.Provider>
  );
};

export const useProgress = (): ProgressContextValue => {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error(
      "useProgress() must be used inside a <ProgressProvider>. Wrap your app's routed tree in App.tsx."
    );
  }
  return ctx;
};
