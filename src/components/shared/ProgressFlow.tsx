/**
 * ProgressFlow — multi-step indicator for chains of wallet signatures.
 *
 * Visual model mirrors the WLFI "Activate unlock schedule" mockups: a
 * horizontal row of dots connected by lines, with each dot showing its
 * status (pending / running / done / failed). Lives in the WLFI gold
 * accent palette already defined in the app's CSS variables.
 *
 * Designed for flows like multi-token deposit: typically 1-N approve
 * txs followed by the actual operation tx (depositMultipleTokens etc).
 *
 * Usage:
 *   const [steps, setSteps] = useState<ProgressStep[]>([
 *     { label: "Approve USD1", status: "pending" },
 *     { label: "Approve WLFI", status: "pending" },
 *     { label: "Deposit", status: "pending" },
 *   ]);
 *
 *   <ProgressFlow
 *     title="Multi-token batch deposit"
 *     steps={steps}
 *     detail={detail}
 *   />
 *
 *   // In your async flow:
 *   setSteps(s => s.map((step, i) => i === 0 ? { ...step, status: "running" } : step));
 *   await approve1.wait();
 *   setSteps(s => s.map((step, i) => i === 0 ? { ...step, status: "done" } : step));
 *   ...
 */

import React from "react";

export type ProgressStepStatus = "pending" | "running" | "done" | "failed";

export interface ProgressStep {
  label: string;
  status: ProgressStepStatus;
  // Optional per-step detail (tx hash link, error message, etc.) shown
  // only when this step is the currently-active one.
  detail?: string;
}

interface ProgressFlowProps {
  title?: string;
  steps: ProgressStep[];
  detail?: string;
  className?: string;
}

export const ProgressFlow: React.FC<ProgressFlowProps> = ({
  title,
  steps,
  detail,
  className,
}) => {
  // Find the active step for the title-line subtitle.
  const runningIdx = steps.findIndex(s => s.status === "running");
  const failedIdx = steps.findIndex(s => s.status === "failed");
  const doneCount = steps.filter(s => s.status === "done").length;
  const subtitle = (() => {
    if (failedIdx >= 0) return `step ${failedIdx + 1} failed — ${steps[failedIdx].label}`;
    if (runningIdx >= 0) return `step ${runningIdx + 1} of ${steps.length} — ${steps[runningIdx].label}`;
    if (doneCount === steps.length) return `${steps.length}/${steps.length} complete ✓`;
    return `${doneCount}/${steps.length} complete`;
  })();

  return (
    <div className={`progress-flow-container ${className ?? ""}`}>
      <style>{`
        .progress-flow-container {
          background: linear-gradient(180deg, rgba(22, 21, 26, 1) 0%, rgba(28, 27, 33, 1) 100%);
          border: 1px solid rgba(255, 220, 130, 0.18);
          border-radius: 14px;
          padding: 16px 18px;
          margin: 14px 0;
          color: #f5f5f5;
          font: 13px/1.55 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        }
        .pf-title { font-weight: 600; margin-bottom: 12px; font-size: 14px; }
        .pf-title .pf-sub {
          margin-left: 10px;
          font-weight: 400;
          color: #9ca3af;
          font-size: 12px;
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
          margin-top: 10px;
          font-family: ui-monospace, "SF Mono", monospace;
          word-break: break-all;
        }
        .pf-detail a { color: #F0B400; }
      `}</style>

      {title && (
        <div className="pf-title">
          {title}
          <span className="pf-sub">{subtitle}</span>
        </div>
      )}

      <div className="pf-stepper">
        {steps.map((s, i) => {
          const digit = (() => {
            if (s.status === "done") return "✓";
            if (s.status === "failed") return "✗";
            return String(i + 1);
          })();
          const isLast = i === steps.length - 1;
          return (
            <React.Fragment key={i}>
              <div className={`pf-step ${s.status === "pending" ? "" : s.status}`}>
                <div className="pf-dot">{digit}</div>
                <span>{s.label}</span>
              </div>
              {!isLast && <div className="pf-conn" />}
            </React.Fragment>
          );
        })}
      </div>

      {detail && (
        <div className="pf-detail" dangerouslySetInnerHTML={{ __html: detail }} />
      )}
    </div>
  );
};

export default ProgressFlow;
