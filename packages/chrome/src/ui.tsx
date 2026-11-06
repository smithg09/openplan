import React from 'react';
import { Icon } from '@openplan/annotations';

export { Icon };

// Shared app chrome primitives for openplan and opendocs. Icons are always the
// Hugeicons registry in @openplan/annotations (`<Icon name="…" />`).

export interface ButtonProps {
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
  type?: 'button' | 'submit';
}

export const Button: React.FC<ButtonProps> = ({ kind = 'ghost', size = 'md', icon, children, onClick, disabled, kbd, title, className, style, active, type = 'button' }) => (
  <button
    type={type}
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

export const Wordmark: React.FC<{ name: string }> = ({ name }) => (
  <div className="op-wordmark">
    <span className="op-prompt">$</span>
    <span style={{ color: 'var(--text-faint)', opacity: 0.6, margin: '0 -2px' }}>/</span>
    <span className="op-name">{name}</span>
  </div>
);

export const Chevron: React.FC<{ dir?: 'down' | 'up' | 'left' | 'right'; size?: number }> = ({ dir = 'down', size = 10 }) => {
  const rot = { down: 0, up: 180, right: -90, left: 90 }[dir];
  return <span style={{ display: 'inline-flex', transform: `rotate(${rot}deg)`, transition: 'transform 160ms cubic-bezier(.16,1,.3,1)', flexShrink: 0 }}><Icon name="expand_more" size={size + 2} /></span>;
};

export const CopyButton: React.FC<{ text?: string; label?: string; getText?: () => Promise<string>; kind?: 'ghost' | 'outline' }> = ({ text, label = 'Copy link', getText, kind = 'outline' }) => {
  const [state, setState] = React.useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  return (
    <Button
      kind={kind}
      size="sm"
      disabled={state === 'busy'}
      icon={<Icon name={state === 'done' ? 'check' : 'content_copy'} size={13} />}
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
        <div className="op-menu op-menu-anim" style={{ top: '100%', [align]: 0, marginTop: 4, minWidth }} onClick={(e) => e.stopPropagation()}>
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
