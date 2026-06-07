import React from 'react';

// ── Button ─────────────────────────────────────────────────────────────────

interface ButtonProps {
  kind?: 'ghost' | 'outline' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  kbd?: string;
  badge?: number | string;
  splitRight?: boolean;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
}

export const Button: React.FC<ButtonProps> = ({
  kind = 'ghost', size = 'md', icon, children, onClick, disabled, kbd, badge, splitRight, style, className, title, type = 'button',
}) => (
  <button
    type={type}
    title={title}
    className={[
      'op-btn',
      `op-btn-${kind}`,
      `op-btn-${size}`,
      !children && icon ? 'op-btn-icon-only' : '',
      splitRight ? 'op-btn-split-l' : '',
      className ?? '',
    ].filter(Boolean).join(' ')}
    onClick={onClick}
    disabled={disabled}
    style={style}
  >
    {icon && <span className="op-btn-icon">{icon}</span>}
    {children && <span>{children}</span>}
    {badge !== undefined && badge !== null && (
      <span className="op-btn-badge">{badge}</span>
    )}
    {kbd && <span className="op-btn-kbd">{kbd}</span>}
  </button>
);

// ── Bracket ────────────────────────────────────────────────────────────────

interface BracketProps {
  children: React.ReactNode;
  color?: string;
  onClick?: () => void;
  hasChevron?: boolean;
}

export const Bracket: React.FC<BracketProps> = ({ children, color, onClick, hasChevron }) => (
  <span
    className={`op-bracket ${onClick ? 'op-bracket-button' : ''}`}
    style={color ? { color } : undefined}
    onClick={onClick}
  >
    <span className="op-bracket-l">[</span>
    <span className="op-bracket-content">{children}</span>
    {hasChevron && <span className="op-bracket-chev">▾</span>}
    <span className="op-bracket-r">]</span>
  </span>
);

// ── StatusPill ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; dot: string; fg: string }> = {
  pending:    { label: 'pending',    dot: 'var(--warning)', fg: 'var(--warning)' },
  approved:   { label: 'approved',   dot: 'var(--success)', fg: 'var(--success)' },
  denied:     { label: 'denied',     dot: 'var(--danger)',  fg: 'var(--danger)' },
  superseded: { label: 'superseded', dot: 'var(--text-muted)', fg: 'var(--text-muted)' },
  current:    { label: 'current',    dot: 'var(--accent)',  fg: 'var(--accent)' },
  editing:    { label: 'editing',    dot: 'var(--warning)', fg: 'var(--warning)' },
};

export const StatusPill: React.FC<{ status: string; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const cfg = STATUS_CFG[status] ?? { label: status, dot: 'var(--text-muted)', fg: 'var(--text-muted)' };
  return (
    <span className={`op-pill op-pill-${size}`} style={{ color: cfg.fg }}>
      <span className="op-pill-dot" style={{ background: cfg.dot }} />
      <span className="op-pill-label">{cfg.label}</span>
    </span>
  );
};

// ── Toggle ─────────────────────────────────────────────────────────────────

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div className={`op-toggle ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)} />
);

// ── Toast ──────────────────────────────────────────────────────────────────

export const Toast: React.FC<{ children: React.ReactNode; onClose?: () => void }> = ({ children, onClose }) => (
  <div className="op-toast">
    <span className="op-toast-bullet">●</span>
    <span>{children}</span>
    {onClose && <button className="op-toast-close" onClick={onClose}>×</button>}
  </div>
);

export const ToastStack: React.FC<{ toasts: Array<{ id: string; text: string }>; onDismiss: (id: string) => void }> = ({ toasts, onDismiss }) => (
  <div className="op-toast-wrap">
    {toasts.map(t => (
      <Toast key={t.id} onClose={() => onDismiss(t.id)}>{t.text}</Toast>
    ))}
  </div>
);

// ── Wordmark ───────────────────────────────────────────────────────────────

export const Wordmark: React.FC = () => (
  <div className="op-wordmark">
    <span className="op-prompt">$</span>
    <span style={{ color: 'var(--text-faint)', opacity: 0.6, margin: '0 -2px' }}>/</span>
    <span className="op-name">openplan</span>
  </div>
);

// ── Chevron ────────────────────────────────────────────────────────────────

export const Chevron: React.FC<{ dir?: 'down' | 'up' | 'left' | 'right'; size?: number }> = ({ dir = 'down', size = 10 }) => {
  const rot = { down: 0, up: 180, right: -90, left: 90 }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ transform: `rotate(${rot}deg)`, transition: 'transform 120ms', display: 'inline-block', flexShrink: 0 }}>
      <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Saved pill ─────────────────────────────────────────────────────────────

export const SavedPill: React.FC<{ savedAgo: number }> = ({ savedAgo }) => (
  <span className="op-saved-pill">
    <span className="op-saved-dot" />
    saved · {savedAgo}s ago
  </span>
);

// ── Live dot ───────────────────────────────────────────────────────────────

export const LiveDot: React.FC = () => <span className="op-live-dot" />;

// ── RelTime ────────────────────────────────────────────────────────────────

export function relTime(iso: string): string {
  const now = Date.now();
  const diff = Math.max(1, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function absTime(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

// ── Shared primitive CSS injected at document level ────────────────────────
// These styles are defined in index.css
