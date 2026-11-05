import React from 'react';
import { Icon } from '@openplan/annotations';

export { Icon };

// Same primitives as openplan's app chrome (apps/ui Primitives.tsx), so the two
// products share buttons, menus and the wordmark.

interface ButtonProps {
  kind?: 'ghost' | 'outline' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  kbd?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  active?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ kind = 'ghost', size = 'md', icon, children, onClick, disabled, kbd, title, className, style, active }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    className={['op-btn', `op-btn-${kind}`, `op-btn-${size}`, !children && icon ? 'op-btn-icon-only' : '', active ? 'is-active' : '', className ?? ''].filter(Boolean).join(' ')}
    onClick={onClick}
    disabled={disabled}
    style={style}
  >
    {icon && <span className="op-btn-icon">{icon}</span>}
    {children && <span>{children}</span>}
    {kbd && <span className="op-btn-kbd">{kbd}</span>}
  </button>
);

export const Wordmark: React.FC = () => (
  <div className="op-wordmark">
    <span className="op-prompt">$</span>
    <span style={{ color: 'var(--text-faint)', opacity: 0.6, margin: '0 -2px' }}>/</span>
    <span className="op-name">opendocs</span>
  </div>
);

export const Chevron: React.FC<{ dir?: 'down' | 'up' | 'left' | 'right'; size?: number }> = ({ dir = 'down', size = 10 }) => {
  const rot = { down: 0, up: 180, right: -90, left: 90 }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ transform: `rotate(${rot}deg)`, transition: 'transform 120ms', display: 'inline-block', flexShrink: 0 }}>
      <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/** Centered dialog using openplan's overlay/modal chrome. */
export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; width?: number; foot?: React.ReactNode }> = ({ title, onClose, children, width = 520, foot }) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="op-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="op-modal" role="dialog" aria-modal="true" aria-label={title} style={{ width, maxWidth: 'calc(100vw - 32px)', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div className="op-modal-head">
          <div className="op-modal-title">{title}</div>
          <Button size="sm" icon={<span style={{ fontSize: 15, lineHeight: 1 }}>×</span>} title="Close" onClick={onClose} />
        </div>
        <div className="op-modal-body" style={{ overflowY: 'auto', minHeight: 0 }}>{children}</div>
        {foot && <div className="op-modal-foot">{foot}</div>}
      </div>
    </div>
  );
};

/** Right-hand drawer (slashdocs-style "Share document" panel) in the same chrome. */
export const Drawer: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="op-overlay op-overlay-right" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="op-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="op-drawer-head">
          <h2>{title}</h2>
          <Button size="sm" icon={<span style={{ fontSize: 16, lineHeight: 1 }}>×</span>} title="Close" onClick={onClose} />
        </div>
        <div className="op-drawer-body">{children}</div>
      </aside>
    </div>
  );
};

export const CopyButton: React.FC<{ text?: string; label?: string; getText?: () => Promise<string>; kind?: 'ghost' | 'outline' }> = ({ text, label = 'Copy link', getText, kind = 'outline' }) => {
  const [state, setState] = React.useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  return (
    <Button
      kind={kind}
      size="sm"
      disabled={state === 'busy'}
      icon={<Icon name="content_copy" size={13} />}
      onClick={async () => {
        setState('busy');
        try { await navigator.clipboard.writeText(getText ? await getText() : text ?? ''); setState('done'); } catch { setState('err'); }
        setTimeout(() => setState('idle'), 1600);
      }}
    >
      {state === 'done' ? 'Copied' : state === 'err' ? 'Copy failed' : label}
    </Button>
  );
};

/** Dropdown anchored under its trigger (op-menu chrome); outside click / Escape closes. */
export const Dropdown: React.FC<{
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
  minWidth?: number;
}> = ({ trigger, children, align = 'right', minWidth = 220 }) => {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={root} style={{ position: 'relative' }}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div className="op-menu" style={{ top: '100%', [align]: 0, marginTop: 4, minWidth }} onClick={(e) => e.stopPropagation()}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

export const MenuItem: React.FC<{ icon?: React.ReactNode; label: string; hint?: string; danger?: boolean; disabled?: boolean; onClick: () => void }> = ({ icon, label, hint, danger, disabled, onClick }) => (
  <button className="op-menu-item" disabled={disabled} style={danger ? { color: 'var(--danger)' } : undefined} onClick={onClick}>
    {icon}<span>{label}</span>{hint && <span className="op-menu-item-kbd">{hint}</span>}
  </button>
);
