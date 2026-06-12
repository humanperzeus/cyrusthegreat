/**
 * ProgressContext — App-level state for the single in-flight progress
 * session.
 *
 * ONE session at a time, on purpose (2026-06-10): a wallet serializes
 * signature requests anyway, and "fire several batches concurrently"
 * just produced piles of chips that didn't match what the chain was
 * actually doing. The honest model we advertise is:
 *
 *   1 click → 1 signature chain → 1 confirmation → 1 ✓
 *
 * While a session is active (steps exist and none failed / not all
 * done), `active` is true — the multi-X modals use it to disable their
 * submit buttons, so a new batch can only start after the current one
 * truly finished (on-chain receipt) or failed.
 *
 * Display:
 *   • Expanded — centered modal with backdrop, body scroll locked.
 *   • Minimized (Hide) — corner chip, page fully interactive.
 *   • Close — dismiss tracking; the underlying tx is NOT cancelled,
 *     the wallet still resolves it on-chain.
 *   • Terminal sessions (all-done or any-failed) auto-close 30s after
 *     reaching that state.
 *
 * API (id-guarded so a stale flow can't repaint a newer session):
 *   const id = startProgress(title, initialSteps);
 *   updateProgress(id, steps);   // ignored if id isn't the live session
 *   closeProgress();             // manual dismiss
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ProgressFlow, ProgressStep } from "@/components/shared/ProgressFlow";

interface ProgressSession {
  id: string;
  title: string;
  steps: ProgressStep[];
  // Latched the first time the session reaches terminal state
  // (all done or any failed); drives the 30s auto-close.
  terminalAt: number | null;
}

interface ProgressContextValue {
  // True while a session exists that has NOT reached terminal state.
  // Modals use this to block starting a second batch.
  active: boolean;
  startProgress: (title: string, initialSteps: ProgressStep[]) => string;
  updateProgress: (id: string, steps: ProgressStep[]) => void;
  closeProgress: () => void;
  // Toggle the live session between centered modal (true) and corner
  // chip (false). Used by the 6 submit handlers to start a session as
  // a chip while the parent Radix Dialog runs its 200ms close
  // animation, then re-expand once the dialog has unmounted — without
  // this, both cards are centered at the same time and the user sees
  // "two bubbles overlapping". See W4 brief notes/worker-w4.md.
  setProgressExpanded: (expanded: boolean) => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

// Auto-close delay for finished/failed sessions. Long enough to read
// the final tx hash + block number; Close dismisses earlier.
const AUTO_CLOSE_MS = 30_000;

let __pfCounter = 0;
const genId = () => `pf_${++__pfCounter}`;

const isTerminal = (steps: ProgressStep[]): boolean => {
  if (steps.length === 0) return false;
  if (steps.some(s => s.status === "failed")) return true;
  return steps.every(s => s.status === "done");
};

export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<ProgressSession | null>(null);
  const [expanded, setExpanded] = useState(true);
  // Mirror of the live session id for the id-guard in updateProgress.
  const liveIdRef = useRef<string | null>(null);

  const startProgress = useCallback((title: string, initialSteps: ProgressStep[]): string => {
    const id = genId();
    liveIdRef.current = id;
    setSession({ id, title, steps: initialSteps, terminalAt: null });
    setExpanded(true); // a new session always opens centered
    return id;
  }, []);

  const updateProgress = useCallback((id: string, steps: ProgressStep[]) => {
    // Stale-flow guard: a background flow from a session the user
    // already closed (or that was replaced) must not repaint the UI.
    if (liveIdRef.current !== id) return;
    setSession(prev => {
      if (!prev || prev.id !== id) return prev;
      // Latch terminalAt on first terminal observation — later detail
      // edits must not restart the 30s auto-close clock.
      const terminalAt = prev.terminalAt ?? (isTerminal(steps) ? Date.now() : null);
      return { ...prev, steps, terminalAt };
    });
  }, []);

  const closeProgress = useCallback(() => {
    liveIdRef.current = null;
    setSession(null);
  }, []);

  const setProgressExpanded = useCallback((next: boolean) => {
    setExpanded(next);
  }, []);

  // Auto-close 30s after the session went terminal. Checked every 2s —
  // precision doesn't matter here.
  useEffect(() => {
    if (!session?.terminalAt) return;
    const interval = setInterval(() => {
      if (session.terminalAt && Date.now() - session.terminalAt > AUTO_CLOSE_MS) {
        closeProgress();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [session?.terminalAt, closeProgress]);

  // Body scroll lock while the modal is expanded (provider-owned so
  // it can't race with anything else).
  useEffect(() => {
    if (!session || !expanded) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [session, expanded]);

  const active = session !== null && session.terminalAt === null;

  return (
    <ProgressContext.Provider value={{ active, startProgress, updateProgress, closeProgress, setProgressExpanded }}>
      {children}
      {session && (
        <ProgressFlow
          title={session.title}
          steps={session.steps}
          expanded={expanded}
          onExpand={() => setExpanded(true)}
          onMinimize={() => setExpanded(false)}
          onClose={closeProgress}
        />
      )}
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
