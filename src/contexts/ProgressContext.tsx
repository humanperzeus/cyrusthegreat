/**
 * ProgressContext — App-level registry of in-flight progress sessions.
 *
 * Each multi-X operation (deposit / withdraw / transfer batch) gets its
 * own ProgressSession with a unique id. Multiple sessions can coexist:
 * the user can start a deposit, Hide it to a corner chip, start a
 * second deposit, and both will be visible — the second as the
 * centered modal, the first as a chip in the corner.
 *
 * Display rules:
 *   • At most ONE session is "expanded" (centered modal) at a time.
 *     Starting a new session expands it. Clicking a chip expands it
 *     and minimizes whatever was previously expanded.
 *   • All other sessions render as stacked chips in the bottom-right.
 *     Most recent at the bottom, older chips stacked upward.
 *   • Body scroll is locked only while something is expanded.
 *   • Terminal sessions (all-done or any-failed) auto-close 30s after
 *     reaching that state. User can Close earlier to dismiss now.
 *     The underlying tx is NOT cancelled by closing — the wallet's
 *     pending tx still resolves on-chain; we just stop tracking it.
 *
 * API:
 *   const id = startProgress(title, initialSteps);  // returns the id
 *   updateProgress(id, steps);                      // push step updates
 *   closeProgress(id);                              // manual dismiss
 *   expandProgress(id | null);                      // focus or collapse-all
 *
 * Wallet flow pattern in a modal:
 *   const { startProgress, updateProgress } = useProgress();
 *   const handleSubmit = () => {
 *     const id = startProgress('Multi-token batch deposit', [
 *       { label: 'Preparing…', status: 'running' },
 *     ]);
 *     onCommitted?.();   // close the parent dialogs
 *     depositMultipleTokensWagmi(deposits, (steps) =>
 *       updateProgress(id, steps),
 *     ).catch(err => console.error(err));
 *   };
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ProgressFlow, ProgressStep } from "@/components/shared/ProgressFlow";

interface ProgressSession {
  id: string;
  title: string;
  steps: ProgressStep[];
  // Timestamp (ms) when the session first reached terminal state
  // (all done or any failed). null while still in flight. Used by the
  // 30-second auto-close timer.
  terminalAt: number | null;
}

interface ProgressContextValue {
  sessions: ProgressSession[];
  expandedId: string | null;
  startProgress: (title: string, initialSteps: ProgressStep[]) => string;
  updateProgress: (id: string, steps: ProgressStep[]) => void;
  closeProgress: (id: string) => void;
  expandProgress: (id: string | null) => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

// Auto-close threshold for terminal sessions. The user can dismiss
// earlier via the Close button. Picked to give enough time to read
// the final tx hash + block number in the modal/chip before it goes.
const AUTO_CLOSE_MS = 30_000;

// Monotonic id generator. We pair the counter with Date.now() so logs
// stay readable across hot-reloads.
let __pfCounter = 0;
const genId = () => `pf_${++__pfCounter}_${Date.now()}`;

const isTerminal = (steps: ProgressStep[]): boolean => {
  if (steps.length === 0) return false;
  // Any failed step → terminal-failed.
  if (steps.some(s => s.status === "failed")) return true;
  // All steps done → terminal-success.
  return steps.every(s => s.status === "done");
};

export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<ProgressSession[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const startProgress = useCallback((title: string, initialSteps: ProgressStep[]): string => {
    const id = genId();
    setSessions(prev => [...prev, { id, title, steps: initialSteps, terminalAt: null }]);
    setExpandedId(id); // new sessions open centered
    return id;
  }, []);

  const updateProgress = useCallback((id: string, steps: ProgressStep[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== id) return s;
      // Latch terminalAt the first time we observe terminal state.
      // Don't reset it on subsequent updates (e.g. detail-line edits
      // shouldn't restart the 30s clock).
      const nowTerminal = isTerminal(steps);
      const terminalAt = s.terminalAt ?? (nowTerminal ? Date.now() : null);
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

  // Auto-close terminal sessions after AUTO_CLOSE_MS. Runs every 2s
  // (precision is not important here). We close whether the session
  // is currently expanded or minimized — the toast already provides
  // a lasting record of the tx outcome.
  useEffect(() => {
    if (sessions.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const expired = sessions.filter(s => s.terminalAt !== null && now - s.terminalAt > AUTO_CLOSE_MS);
      if (expired.length === 0) return;
      const expiredIds = new Set(expired.map(s => s.id));
      setSessions(prev => prev.filter(s => !expiredIds.has(s.id)));
      setExpandedId(prev => (prev !== null && expiredIds.has(prev) ? null : prev));
    }, 2000);
    return () => clearInterval(interval);
  }, [sessions]);

  // Body scroll lock: only when something is expanded. Multiple
  // ProgressFlow instances would otherwise race to set/restore
  // document.body.style.overflow.
  useEffect(() => {
    if (expandedId === null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [expandedId]);

  // Chip stacking: among the sessions that are NOT currently expanded,
  // we assign an integer index used to offset each chip upward from
  // the bottom-right corner. Index 0 sits at the corner; index 1 above
  // it, etc. We iterate in reverse so the most recently started chip
  // ends up nearest the corner (visually "newest at bottom").
  const chips = sessions.filter(s => s.id !== expandedId);
  const chipIndexFor = (id: string): number =>
    chips.length - 1 - chips.findIndex(s => s.id === id);

  return (
    <ProgressContext.Provider
      value={{ sessions, expandedId, startProgress, updateProgress, closeProgress, expandProgress }}
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
