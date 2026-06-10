/**
 * ProgressFlow — floating modal step indicator for chains of wallet signatures.
 *
 * Mirrors the debug UI's createProgressFlow() helper (tools/contract-debug/
 * index.html) so what users see on the live site matches what we use to test
 * locally. Two states:
 *
 *   • Expanded — backdrop dimmed, centered card, page is non-interactive.
 *   • Minimized — backdrop gone, modal shrinks to a small chip in the
 *     bottom-right with live status text; the page becomes fully interactive
 *     so the user can keep working while a long-pending tx waits.
 *
 * Hide and Close are ALWAYS available (no waiting for terminal state):
 *   • Hide  — collapses to the corner chip; click chip body to re-expand.
 *   • Close — calls onClose so the parent can unmount this component. The
 *             underlying tx is NOT cancelled by clicking Close — the wallet's
 *             pending tx still resolves on-chain; the user just stops
 *             tracking it in this UI.
 *
 * Usage (parent owns the steps state and unmount lifecycle):
 *
 *   const [steps, setSteps] = useState<ProgressStep[]>([]);
 *
 *   // Mount only when steps array is non-empty.
 *   {steps.length > 0 && (
 *     <ProgressFlow
 *       title="Multi-token batch deposit"
 *       steps={steps}
 *       onClose={() => setSteps([])}
 *     />
 *   )}
 *
 *   // Drive via the parent flow:
 *   setSteps([
 *     { label: "Approve USD1", status: "pending" },
 *     { label: "Approve WLFI", status: "pending" },
 *     { label: "Deposit", status: "pending" },
 *   ]);
 *   await approveUsd1();
 *   setSteps(s => s.map((step, i) => i === 0 ? { ...step, status: "done" } : step));
 *   ...
 */

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type ProgressStepStatus = "pending" | "running" | "done" | "failed";

export interface ProgressStep {
  label: string;
  status: ProgressStepStatus;
  // Optional per-step detail (tx hash link, error message, etc.) shown in
  // the modal's detail line. The detail of the currently-active step (or
  // the last failed step) is what we show.
  detail?: string;
}

interface ProgressFlowProps {
  title?: string;
  steps: ProgressStep[];
  // CONTROLLED display state. The parent (ProgressProvider) owns
  // whether this shows as the centered modal (`expanded: true`) or as
  // the corner chip (`expanded: false`).
  expanded: boolean;
  // Click on the chip body → request expansion.
  onExpand?: () => void;
  // Click on Hide → request minimization to corner chip.
  onMinimize?: () => void;
  // Click on Close → dismiss the session entirely (the underlying tx
  // is NOT cancelled; it just stops being tracked in this UI).
  onClose?: () => void;
  className?: string;
}

export const ProgressFlow: React.FC<ProgressFlowProps> = ({
  title,
  steps,
  expanded,
  onExpand,
  onMinimize,
  onClose,
  className,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  // `minimized` is derived directly from the controlled `expanded` prop
  // — there is no longer any internal toggle state. This keeps the
  // multi-session display rules (at most one expanded) coherent.
  const minimized = !expanded;

  // ─── Stop pointer/mouse bubbling to document at NATIVE level ───
  // The ProgressFlow renders via createPortal to document.body, OUTSIDE
  // the parent Radix <Dialog>'s DialogContent subtree. Radix's
  // DismissableLayer registers NATIVE event listeners on document for
  // pointerdown and fires onPointerDownOutside when the event target
  // isn't inside DialogContent — which our overlay never is. Result:
  // every click in our overlay (Hide, Close, anywhere) was being read
  // as "click outside the parent dialog", closing the parent dialog
  // before our own button handlers could run.
  //
  // The fix has to be a NATIVE listener, not a React synthetic one.
  // React synthetic stopPropagation on a portal child does NOT reliably
  // stop the native event from continuing to bubble up to document —
  // because the React root container (which is React's event delegation
  // point) isn't in the bubble path for portal children (the portal
  // lives in body alongside, not inside, the React root). So Radix's
  // document-level listener sees the event regardless.
  //
  // Attaching listeners with addEventListener directly on the overlay
  // ref means the listener runs during the native bubble phase right
  // at the overlay element, BEFORE the event reaches body and document.
  // Native stopPropagation here genuinely stops it.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const stopNative = (e: Event) => e.stopPropagation();
    overlay.addEventListener("pointerdown", stopNative);
    overlay.addEventListener("mousedown",   stopNative);
    overlay.addEventListener("pointerup",   stopNative);
    overlay.addEventListener("mouseup",     stopNative);
    return () => {
      overlay.removeEventListener("pointerdown", stopNative);
      overlay.removeEventListener("mousedown",   stopNative);
      overlay.removeEventListener("pointerup",   stopNative);
      overlay.removeEventListener("mouseup",     stopNative);
    };
  }, []);

  // Body scroll lock is now owned by ProgressProvider — it locks once
  // when ANY session is expanded, unlocks when all are collapsed.
  // Per-instance lock here would race with sibling ProgressFlows.

  // Derived state — figure out which step is "currently active" for the
  // chip label and the title subtitle.
  const runningIdx = steps.findIndex(s => s.status === "running");
  const failedIdx = steps.findIndex(s => s.status === "failed");
  const doneCount = steps.filter(s => s.status === "done").length;
  const isTerminal = failedIdx >= 0 || doneCount === steps.length;

  const subtitle = (() => {
    if (failedIdx >= 0) return `step ${failedIdx + 1} failed — ${steps[failedIdx].label}`;
    if (runningIdx >= 0) return `step ${runningIdx + 1} of ${steps.length} — ${steps[runningIdx].label}`;
    if (doneCount === steps.length) return `${steps.length}/${steps.length} complete ✓`;
    return `${doneCount}/${steps.length} complete`;
  })();

  // Pick the detail line to show — the active step's detail, or the
  // last-failed step's detail if the flow failed.
  const activeDetail = (() => {
    if (failedIdx >= 0) return steps[failedIdx].detail;
    if (runningIdx >= 0) return steps[runningIdx].detail;
    if (isTerminal) return steps[steps.length - 1]?.detail;
    return undefined;
  })();

  // Chip (minimized) icon + text derivation.
  const chipState: { icon: React.ReactNode; iconClass: string; label: string; sub: string } = (() => {
    if (failedIdx >= 0) {
      return {
        icon: "✗",
        iconClass: "failed",
        label: title || "Failed",
        sub: `step ${failedIdx + 1} failed · tap to view`,
      };
    }
    if (doneCount === steps.length) {
      return {
        icon: "✓",
        iconClass: "done",
        label: title || "Complete",
        sub: `${steps.length}/${steps.length} complete · tap to view`,
      };
    }
    const idx = runningIdx >= 0 ? runningIdx : doneCount;
    const safeIdx = Math.min(idx, steps.length - 1);
    return {
      icon: String(safeIdx + 1),
      iconClass: "",
      label: title || "Progress",
      sub: `step ${safeIdx + 1} of ${steps.length} — ${steps[safeIdx]?.label ?? ""}`,
    };
  })();

  const handleClose = () => {
    onClose?.();
  };

  const handleHide = () => {
    onMinimize?.();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    // In minimized mode, a click on the chip body re-expands. In
    // expanded mode, backdrop clicks are no-ops (intentional — dismissal
    // is button-only to prevent accidental loss of context mid-flow).
    if (!minimized) return;
    const target = e.target as HTMLElement;
    // Only re-expand if the click came on the chip body (the .pf-modal),
    // not on the Close button (which has its own stopPropagation).
    if (target.closest(".pf-modal") && !target.closest("button")) {
      onExpand?.();
    }
  };

  // Render dots + connectors for the expanded view.
  const stepperNodes = steps.map((s, i) => {
    const isLast = i === steps.length - 1;
    const digit = (() => {
      if (s.status === "done") return "✓";
      if (s.status === "failed") return "✗";
      return String(i + 1);
    })();
    const cls = s.status === "pending" ? "" : s.status;
    return (
      <React.Fragment key={i}>
        <div className={`pf-step ${cls}`}>
          <div className="pf-dot">{digit}</div>
          <span>{s.label}</span>
        </div>
        {!isLast && <div className="pf-conn" />}
      </React.Fragment>
    );
  });

  const overlay = (
    <div
      ref={overlayRef}
      className={`pf-overlay open ${minimized ? "minimized" : ""} ${className ?? ""}`}
      onClick={handleOverlayClick}
    >
      <style>{`
        .pf-overlay {
          position: fixed;
          inset: 0;
          background: rgba(8, 7, 12, 0.78);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          opacity: 0;
          transition: opacity 0.22s ease, background 0.22s ease, backdrop-filter 0.22s ease;
          padding: 16px;
          animation: pfFadeIn 0.22s ease forwards;
          /* CRITICAL: override body's pointer-events: none. Radix Dialog's
             modal scroll lock (react-remove-scroll) sets pointer-events:
             none on document.body to deactivate everything behind it.
             CSS pointer-events doesn't formally inherit, but the effect
             does propagate through hit-testing: a descendant of an
             element with pe: none is effectively non-interactable until
             an ancestor re-enables it with pe: auto. Without this line,
             every button in our overlay (Hide, Close, etc.) is dead. */
          pointer-events: auto;
        }
        /* Modal card stays interactive in both expanded and minimized
           modes (the chip needs to be clickable to re-expand). */
        .pf-modal { pointer-events: auto; }
        @keyframes pfFadeIn {
          to { opacity: 1; }
        }
        .pf-modal {
          background: linear-gradient(180deg, #16151a 0%, #1c1b21 100%);
          border: 1px solid rgba(255, 220, 130, 0.18);
          border-radius: 18px;
          padding: 30px 34px 26px;
          max-width: 640px;
          width: 100%;
          box-shadow:
            0 24px 70px rgba(0, 0, 0, 0.65),
            0 0 0 1px rgba(240, 180, 0, 0.14),
            0 0 60px rgba(240, 180, 0, 0.05);
          transition:
            transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
            padding 0.22s ease,
            border-radius 0.22s ease,
            max-width 0.22s ease;
          position: relative;
          color: #f5f5f5;
          font: 13px/1.55 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          animation: pfPopIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes pfPopIn {
          from { transform: translateY(10px) scale(0.97); }
          to   { transform: translateY(0)   scale(1); }
        }
        .pf-title {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 18px;
          padding-right: 130px;
        }
        .pf-title .pf-sub {
          font-weight: 400;
          color: #9ca3af;
          font-size: 12px;
          margin-left: 8px;
        }
        .pf-stepper {
          display: flex;
          align-items: center;
          gap: 0;
          overflow-x: auto;
          padding: 4px 0;
          scrollbar-width: thin;
        }
        .pf-step {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #9ca3af;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .pf-dot {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          border: 1.5px solid rgba(255, 255, 255, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 11px;
          color: #f5f5f5;
        }
        .pf-step.done { color: #10b981; font-weight: 600; }
        .pf-step.done .pf-dot {
          background: #10b981;
          border-color: #10b981;
          color: white;
        }
        .pf-step.running { color: #FFC83D; font-weight: 700; }
        .pf-step.running .pf-dot {
          background: #F0B400;
          border-color: #F0B400;
          color: #0a0a0c;
          animation: pfPulse 1.2s infinite ease-in-out;
        }
        .pf-step.failed { color: #ef4444; font-weight: 700; }
        .pf-step.failed .pf-dot {
          background: #ef4444;
          border-color: #ef4444;
          color: white;
        }
        @keyframes pfPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(240, 180, 0, 0.45); }
          50%      { box-shadow: 0 0 0 10px rgba(240, 180, 0, 0); }
        }
        .pf-conn {
          flex: 1;
          height: 1.5px;
          background: rgba(255, 255, 255, 0.1);
          margin: 0 12px;
          min-width: 24px;
        }
        .pf-step.done + .pf-conn { background: #10b981; }
        .pf-detail {
          font-size: 12px;
          color: #9ca3af;
          margin-top: 12px;
          font-family: ui-monospace, "SF Mono", monospace;
          word-break: break-all;
        }
        .pf-detail a { color: #F0B400; }

        /* Header buttons row — always visible. */
        .pf-controls {
          position: absolute;
          top: 14px;
          right: 14px;
          display: flex;
          gap: 8px;
        }
        .pf-controls button {
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 999px;
          border: 1px solid rgba(255, 220, 130, 0.18);
          background: transparent;
          color: #f5f5f5;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .pf-controls button:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.28);
        }

        /* Mini-mode (chip) body — hidden in expanded mode. */
        .pf-mini { display: none; align-items: center; gap: 10px; }
        .pf-mini-icon {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #F0B400;
          color: #0a0a0c;
          font-weight: 800;
          font-size: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          animation: pfPulse 1.2s infinite ease-in-out;
        }
        .pf-mini-icon.done   { background: #10b981; color: white; animation: none; }
        .pf-mini-icon.failed { background: #ef4444; color: white; animation: none; }
        .pf-mini-text { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
        .pf-mini-label {
          font-weight: 600;
          color: #f5f5f5;
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 240px;
        }
        .pf-mini-sub {
          color: #9ca3af;
          font-size: 11px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 240px;
        }

        /* Minimized state */
        .pf-overlay.minimized {
          background: transparent;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          inset: auto 16px 16px auto;
          width: auto;
          height: auto;
          padding: 0;
          pointer-events: none;
          display: block;
          animation: none;
          opacity: 1;
        }
        .pf-overlay.minimized .pf-modal {
          pointer-events: auto;
          padding: 10px 14px;
          border-radius: 999px;
          max-width: 340px;
          width: auto;
          cursor: pointer;
          transform: none;
          box-shadow: 0 6px 28px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(240, 180, 0, 0.28);
          display: flex;
          align-items: center;
          animation: none;
        }
        .pf-overlay.minimized .pf-modal:hover {
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(240, 180, 0, 0.48);
        }
        .pf-overlay.minimized .pf-progress-body,
        .pf-overlay.minimized .pf-controls .pf-hide {
          display: none;
        }
        .pf-overlay.minimized .pf-controls {
          position: static;
          margin-left: 12px;
        }
        .pf-overlay.minimized .pf-controls button {
          padding: 4px 10px;
          font-size: 11px;
        }
        .pf-overlay.minimized .pf-mini { display: flex; }
      `}</style>

      <div className="pf-modal" role="dialog" aria-modal="true" aria-label={title ?? "Progress"}>
        <div className="pf-mini">
          <div className={`pf-mini-icon ${chipState.iconClass}`}>{chipState.icon}</div>
          <div className="pf-mini-text">
            <div className="pf-mini-label">{chipState.label}</div>
            <div className="pf-mini-sub">{chipState.sub}</div>
          </div>
        </div>

        <div className="pf-progress-body">
          {title && (
            <div className="pf-title">
              {title}
              <span className="pf-sub">{subtitle}</span>
            </div>
          )}

          <div className="pf-stepper">{stepperNodes}</div>

          {activeDetail && (
            <div className="pf-detail" dangerouslySetInnerHTML={{ __html: activeDetail }} />
          )}
        </div>

        <div className="pf-controls">
          <button
            type="button"
            className="pf-hide"
            onClick={(e) => { e.stopPropagation(); handleHide(); }}
          >
            Hide
          </button>
          <button
            type="button"
            className="pf-close"
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // Render into document.body via portal so the overlay floats above any
  // existing Radix Dialogs and isn't constrained by parent stacking
  // contexts. Guard for SSR (no document at module load on server-render).
  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
};

export default ProgressFlow;
