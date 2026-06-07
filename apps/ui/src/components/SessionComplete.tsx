import React from 'react';
import { Button } from './Primitives';
import type { ApproveFlow } from '../store';
import { useStore } from '../store';
import { useAutoClose } from '../hooks/useAutoClose';

interface SessionCompleteProps {
  flow: ApproveFlow;
  onCancelClose: () => void;
}

export const SessionComplete: React.FC<SessionCompleteProps> = ({ flow, onCancelClose }) => {
  const { phase: flowPhase, decision, savedTo } = flow;
  const { autoCloseDelay, finishCountdown } = useStore();
  const decisionLabel = decision === 'approve' ? 'allow' : 'deny';

  // Drive auto-close from the hook — active once we've passed submitting phase
  const isReady = flowPhase === 'countdown' || flowPhase === 'closeFailed';
  const { phase: closePhase, countdown } = useAutoClose({
    active: isReady,
    autoCloseDelay,
    onCloseFailed: finishCountdown,
  });

  // Derive effective phase: submitting comes from flow, rest from hook
  const phase = flowPhase === 'submitting'
    ? 'submitting'
    : closePhase === 'closeFailed' || flowPhase === 'closeFailed'
      ? 'closeFailed'
      : closePhase === 'countdown'
        ? 'countdown'
        : flowPhase;

  const isApproval = decision === 'approve';

  return (
    <div
      className="op-session-complete"
      style={isApproval ? { '--accent': 'var(--success)', '--accent-hover': '#16a34a' } as React.CSSProperties : undefined}
    >
      <div className="op-session-card">
        <div className="op-session-icon" data-phase={phase}>
          {phase === 'submitting' ? (
            <div className="op-session-spinner" />
          ) : (
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 18l7 7 14-15" />
            </svg>
          )}
        </div>

        <div className="op-session-title">
          {phase === 'submitting' && 'Submitting decision…'}
          {phase === 'countdown' && (decision === 'approve' ? 'Approved' : 'Sent to Claude')}
          {phase === 'closeFailed' && 'Session complete'}
        </div>

        <div className="op-session-sub">
          {phase === 'submitting' && `POST /api/${decision === 'approve' ? 'approve' : 'deny'} → openplan server…`}
          {phase === 'countdown' && 'Claude has received your decision. Closing in…'}
          {phase === 'closeFailed' && 'Claude has received your decision. Browser blocked auto-close. You can close this tab safely.'}
        </div>

        {phase === 'countdown' && (
          <div className="op-session-countdown-wrap">
            <div className="op-session-countdown" key={countdown}>{countdown}</div>
          </div>
        )}
      </div>

      {(phase === 'countdown' || phase === 'closeFailed') && (
        <div className="op-session-log">
          <div className="op-session-log-line">
            <span className="op-session-log-prompt">$ openplan resolve --decision {decisionLabel}</span>
          </div>
          <div className="op-session-log-line op-session-log-ok">
            <span>&nbsp;&nbsp;● snapshot written</span>
          </div>
          {(savedTo ?? []).map((s, i) => (
            <div key={i} className="op-session-log-line op-session-log-ok">
              <span>&nbsp;&nbsp;● saved → {s}</span>
            </div>
          ))}
          <div className="op-session-log-line op-session-log-ok">
            <span>&nbsp;&nbsp;● stdout flushed · server exiting in 1500ms</span>
          </div>
          <div className="op-session-log-line">
            <span style={{ color: 'var(--text-faint)' }}>
              &nbsp;&nbsp;{'# hook returns { behavior: "' + decisionLabel + '" }'}
            </span>
          </div>
        </div>
      )}

      <div className="op-session-actions">
        {phase === 'countdown' && (
          <Button kind="ghost" size="md" onClick={onCancelClose}>keep tab open</Button>
        )}
        {phase === 'closeFailed' && (
          <>
            <Button kind="ghost" size="md" onClick={onCancelClose}>↺ restart</Button>
            <Button kind="primary" size="md" onClick={() => window.close()}>close tab</Button>
          </>
        )}
      </div>
    </div>
  );
};
