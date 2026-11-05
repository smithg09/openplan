import React from 'react';

/** Centered dialog with a backdrop; Escape or a backdrop click closes it. */
export function Modal({ title, onClose, children, width = 520 }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="od-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="od-modal" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <div className="od-modal-head">
          <h2>{title}</h2>
          <button className="od-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="od-modal-body">{children}</div>
      </div>
    </div>
  );
}

/** A button that copies text and briefly says so. */
export function CopyButton({ text, label = 'Copy', getText }: { text?: string; label?: string; getText?: () => Promise<string> }) {
  const [state, setState] = React.useState<'idle' | 'busy' | 'done' | 'err'>('idle');
  return (
    <button
      className="od-btn od-btn-ghost od-copy"
      disabled={state === 'busy'}
      onClick={async () => {
        setState('busy');
        try {
          await navigator.clipboard.writeText(getText ? await getText() : text ?? '');
          setState('done');
        } catch {
          setState('err');
        }
        setTimeout(() => setState('idle'), 1600);
      }}
    >
      {state === 'done' ? 'Copied ✓' : state === 'err' ? 'Failed' : label}
    </button>
  );
}

/** Small dropdown menu anchored under its trigger; closes on outside click / Escape. */
export function Menu({ trigger, items, align = 'right' }: {
  trigger: React.ReactNode;
  items: ({ label: string; onSelect: () => void; hint?: string } | 'sep')[];
  align?: 'left' | 'right';
}) {
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
    <div className="od-menu" ref={root}>
      <button className="od-menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{trigger}</button>
      {open && (
        <div className={`od-menu-pop od-menu-${align}`} role="menu">
          {items.map((it, i) =>
            it === 'sep' ? <div className="od-menu-sep" key={i} /> : (
              <button key={i} role="menuitem" className="od-menu-item" onClick={() => { setOpen(false); it.onSelect(); }}>
                <span>{it.label}</span>{it.hint && <kbd>{it.hint}</kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
