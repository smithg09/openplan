import React from 'react';

/** The sibling products that share a marketing presence. */
export const SITES = [
  { id: 'openplan', name: 'openplan', blurb: 'Review & approve agent plans', href: 'https://openplan.smithgajjar.dev' },
  { id: 'opendocs', name: 'opendocs', blurb: 'Review HTML docs your agent writes', href: 'https://opendocs.smithgajjar.dev' },
] as const;

export type SiteId = (typeof SITES)[number]['id'];

const CSS = `
.osw{position:relative;display:inline-flex}
.osw-btn{display:flex;align-items:center;gap:7px;background:none;border:0;padding:6px 8px;margin:-6px -8px;border-radius:8px;cursor:pointer;font:600 13px var(--font-mono,ui-monospace,monospace);color:var(--text-primary,#fafafa)}
.osw-btn:hover,.osw-btn[aria-expanded=true]{background:var(--bg-subtle,#27272a)}
.osw-p{color:var(--accent-fg,#93c5fd)}.osw-s{color:var(--text-faint,#52525b);font-weight:400}
.osw-chev{width:10px;height:10px;color:var(--text-muted,#71717a);transition:transform .15s}
.osw-btn[aria-expanded=true] .osw-chev{transform:rotate(180deg)}
.osw-menu{position:absolute;top:100%;left:-8px;min-width:250px;padding-top:10px;z-index:100}
.osw-card{background:var(--bg-elevated,#1f1f23);border:1px solid var(--border,#2e2e33);border-radius:12px;padding:6px;box-shadow:0 12px 32px rgba(0,0,0,.35)}
.osw-item{display:block;text-decoration:none;padding:10px 12px;border-radius:8px;color:var(--text-primary,#fafafa)}
.osw-item:hover,.osw-item:focus-visible{background:var(--bg-subtle,#27272a);outline:none}
.osw-name{font:600 13px var(--font-mono,ui-monospace,monospace);display:flex;align-items:center;gap:8px}
.osw-cur{font:500 10px var(--font-sans,system-ui);text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted,#71717a);border:1px solid var(--border,#2e2e33);border-radius:999px;padding:1px 6px}
.osw-blurb{font:400 12px var(--font-sans,system-ui);color:var(--text-secondary,#a1a1aa);margin-top:2px}
`;

/**
 * Product-name dropdown shared by the openplan and opendocs marketing navs.
 * Opens on hover and on click/focus (touch + keyboard); Escape closes it.
 */
export function SiteSwitcher({ current }: { current: SiteId }) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<number>();
  const root = React.useRef<HTMLDivElement>(null);

  const show = () => { window.clearTimeout(timer.current); setOpen(true); };
  // Small delay so the pointer can cross the gap between the button and the menu.
  const hide = () => { timer.current = window.setTimeout(() => setOpen(false), 120); };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDoc = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDoc); };
  }, [open]);

  return (
    <div className="osw" ref={root} onMouseEnter={show} onMouseLeave={hide}>
      <style>{CSS}</style>
      <button className="osw-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} onFocus={show}>
        <span className="osw-p">$</span><span className="osw-s">/</span><span>{current}</span>
        <svg className="osw-chev" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" /></svg>
      </button>
      {open && (
        <div className="osw-menu" role="menu">
          <div className="osw-card">
            {SITES.map((s) => (
              <a key={s.id} className="osw-item" role="menuitem" href={s.href} aria-current={s.id === current ? 'page' : undefined}>
                <div className="osw-name">
                  <span className="osw-p">$</span><span className="osw-s">/</span>{s.name}
                  {s.id === current && <span className="osw-cur">you're here</span>}
                </div>
                <div className="osw-blurb">{s.blurb}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
