/**
 * ProgressContext — global progress-modal state, lifted ABOVE every
 * Radix <Dialog> in the app.
 *
 * Why this exists:
 * Multi-X flows (deposit / withdraw / transfer batches) used to keep
 * progress state INSIDE the Dialog that triggered them. That meant:
 *   • The Radix Dialog stayed open (dimming + scroll-lock) for the
 *     whole tx, even after the user collapsed the progress to chip
 *     mode — they couldn't actually use the page.
 *   • A click outside the chip dismissed the parent Dialog, which
 *     unmounted the progress chip with it.
 *
 * With this provider:
 *   • Progress state lives at the App level, beside (not inside) any
 *     Dialog. The ProgressFlow renders here, as a top-level sibling.
 *   • When a multi-X modal commits, it calls setProgress() AND closes
 *     itself + its parent. The user sees only the progress modal /
 *     chip after that, and the rest of the page is fully interactive.
 *   • The Close button calls clearProgress() to dismiss the chip;
 *     the underlying tx is NOT cancelled (the wallet still resolves
 *     it on-chain — Close just stops tracking it in this UI).
 *
 * Usage:
 *   In App.tsx, wrap the routed tree in <ProgressProvider>.
 *   In any modal that drives a multi-step op:
 *     const { setProgress } = useProgress();
 *     setProgress([{label: 'Preparing…', status: 'running'}], 'Multi-token batch deposit');
 *     onCommitted?.();  // tell the parent modal it's safe to close now
 *     await depositMultipleTokensWagmi(deposits, (steps) =>
 *       setProgress(steps, 'Multi-token batch deposit')
 *     );
 */

import React, { createContext, useCallback, useContext, useState } from "react";
import { ProgressFlow, ProgressStep } from "@/components/shared/ProgressFlow";

interface ProgressContextValue {
  steps: ProgressStep[];
  title: string;
  setProgress: (steps: ProgressStep[], title?: string) => void;
  clearProgress: () => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

/**
 * Wraps the app and owns the single global ProgressFlow instance.
 * Renders the ProgressFlow as a sibling of children when steps > 0.
 */
export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [title, setTitle] = useState<string>("");

  // setProgress accepts an optional title — useful for the FIRST emit
  // when the modal opens, then later updates can omit the title and
  // it stays put.
  const setProgress = useCallback((next: ProgressStep[], nextTitle?: string) => {
    setSteps(next);
    if (nextTitle !== undefined) setTitle(nextTitle);
  }, []);

  const clearProgress = useCallback(() => {
    setSteps([]);
    setTitle("");
  }, []);

  return (
    <ProgressContext.Provider value={{ steps, title, setProgress, clearProgress }}>
      {children}
      {steps.length > 0 && (
        <ProgressFlow
          title={title}
          steps={steps}
          onClose={clearProgress}
        />
      )}
    </ProgressContext.Provider>
  );
};

/**
 * Hook for any descendant component to publish progress updates or
 * clear the modal. Throws if used outside <ProgressProvider> so a
 * missing provider fails loudly at dev time instead of silently
 * dropping updates.
 */
export const useProgress = (): ProgressContextValue => {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error(
      "useProgress() must be used inside a <ProgressProvider>. Wrap your app's routed tree in App.tsx."
    );
  }
  return ctx;
};
