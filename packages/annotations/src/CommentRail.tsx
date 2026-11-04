import React from 'react';
import type { Annotation } from '@openplan/shared';
import { X } from 'lucide-react';
import { AnnoCard } from './AnnoCard';

interface CommentRailProps {
  annotations: Annotation[];
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onEdit: (id: string, body: string) => void;
  onRemove: (id: string) => void;
  onResolve?: (id: string) => void;
  onReply?: (id: string, body: string) => void;
  onReact?: (id: string, emoji: string) => void;
  onCopyLink?: (id: string) => void;
  onClose: () => void;
  onCopyMD?: () => void;
  /** Scroll container that holds the annotated content + highlight marks. */
  scrollSelector?: string;
}

const GAP = 12;

/**
 * Anchored comment rail — each card floats at the vertical position of its
 * highlight (via `[data-bind-id]`) in the scroll container, collision-resolved
 * downward, and repositions on scroll/resize. The focused card expands; the
 * rest render compact. Cards whose anchor can't be found stack at the bottom.
 */
export const CommentRail: React.FC<CommentRailProps> = ({
  annotations, focusId, onFocus, onEdit, onRemove, onResolve, onReply, onReact, onCopyLink, onClose, onCopyMD,
  scrollSelector = '.op-plan-wrap',
}) => {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const rafRef = React.useRef<number | null>(null);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const reflow = React.useCallback(() => {
    const viewport = viewportRef.current;
    const scrollEl = document.querySelector(scrollSelector);
    if (!viewport || !scrollEl) return;
    const vpTop = viewport.getBoundingClientRect().top;

    type Item = { id: string; el: HTMLDivElement; h: number; desired: number | null; top: number };
    const items: Item[] = [];
    for (const a of annotations) {
      const el = cardRefs.current.get(a.id);
      if (!el) continue;
      const mark = scrollEl.querySelector(`[data-bind-id="${a.id}"]`) as HTMLElement | null;
      const desired = mark ? mark.getBoundingClientRect().top - vpTop : null;
      items.push({ id: a.id, el, h: el.offsetHeight, desired, top: 0 });
    }

    const anchored = items.filter(i => i.desired != null).sort((x, y) => (x.desired! - y.desired!));
    const unanchored = items.filter(i => i.desired == null);

    // Nudge the focused card to sit exactly at its anchor; others flow around it.
    let cursor = -Infinity;
    for (const it of anchored) {
      let top = it.desired!;
      if (cursor !== -Infinity && top < cursor + GAP) top = cursor + GAP;
      it.top = top;
      cursor = top + it.h;
    }
    for (const it of unanchored) {
      const top = cursor === -Infinity ? 0 : cursor + GAP;
      it.top = top;
      cursor = top + it.h;
    }

    for (const it of items) {
      it.el.style.transform = `translateY(${Math.round(it.top)}px)`;
      it.el.style.opacity = it.desired == null ? '1' : (it.top + it.h < 0 ? '0' : '1');
    }
  }, [annotations, scrollSelector]);

  const scheduleReflow = React.useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; reflow(); });
  }, [reflow]);

  // Reposition on content scroll / window resize / content resize.
  React.useEffect(() => {
    const scrollEl = document.querySelector(scrollSelector);
    const body = scrollEl?.querySelector('.op-plan-body') ?? scrollEl;
    scrollEl?.addEventListener('scroll', scheduleReflow, { passive: true });
    window.addEventListener('resize', scheduleReflow);
    const ro = body ? new ResizeObserver(scheduleReflow) : null;
    if (body) ro!.observe(body);
    return () => {
      scrollEl?.removeEventListener('scroll', scheduleReflow);
      window.removeEventListener('resize', scheduleReflow);
      ro?.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollSelector, scheduleReflow]);

  // Reflow after render whenever layout inputs change. Marks are applied by the
  // editor on rAF, so retry a couple of frames to catch late-inserted marks.
  React.useLayoutEffect(() => {
    reflow();
    const t1 = requestAnimationFrame(reflow);
    const t2 = window.setTimeout(reflow, 120);
    return () => { cancelAnimationFrame(t1); clearTimeout(t2); };
  }, [annotations, focusId, hoveredId, reflow]);

  const total = annotations.length;

  return (
    <div className="op-annopanel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)' }}>Comments</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', borderRadius: 999, padding: '0 7px', minWidth: 18, textAlign: 'center' }}>{total}</span>
        <div style={{ flex: 1 }} />
        {onCopyMD && (
          <button onClick={onCopyMD} title="Copy as Markdown" style={{ fontSize: 12, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}>Copy MD</button>
        )}
        <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-faint)', borderRadius: 6, display: 'inline-flex' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}>
          <X size={14} strokeWidth={1.7} />
        </button>
      </div>

      {/* Anchored viewport */}
      <div ref={viewportRef} style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {total === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>No comments yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Select text to add one.</div>
          </div>
        ) : (
          annotations.map(a => {
            const expanded = a.id === focusId || a.id === hoveredId;
            return (
              <div
                key={a.id}
                ref={el => { if (el) cardRefs.current.set(a.id, el); else cardRefs.current.delete(a.id); }}
                onMouseEnter={() => setHoveredId(a.id)}
                onMouseLeave={() => setHoveredId(h => (h === a.id ? null : h))}
                style={{
                  position: 'absolute', left: 10, right: 10, top: 0,
                  transform: 'translateY(0px)', willChange: 'transform',
                  zIndex: expanded ? 5 : 1,
                  transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <AnnoCard
                  anno={a}
                  isFocus={a.id === focusId}
                  expanded={expanded}
                  onClick={() => onFocus(a.id)}
                  onEdit={onEdit}
                  onRemove={() => onRemove(a.id)}
                  onResolve={onResolve}
                  onReply={onReply}
                  onReact={onReact}
                  onCopyLink={onCopyLink}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
