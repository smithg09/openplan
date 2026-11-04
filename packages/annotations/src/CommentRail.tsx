import React from 'react';
import type { Annotation } from '@openplan/shared';
import { AnnoCard } from './AnnoCard';
import { Icon } from './icons';

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
const PAD_BOTTOM = 80;

/**
 * Anchored comment rail — each card sits at the absolute vertical position of
 * its highlight (via `[data-bind-id]`) in the scroll container, collision-
 * resolved downward. The rail is its own scroll area whose scroll position is
 * kept in sync with the document (both ways), so cards stay glued to their
 * anchors AND you can scroll the rail to reach overflowed comments. The
 * focused/hovered card expands; the rest render compact. Cards whose anchor
 * can't be found stack at the bottom.
 */
export const CommentRail: React.FC<CommentRailProps> = ({
  annotations, focusId, onFocus, onEdit, onRemove, onResolve, onReply, onReact, onCopyLink, onClose, onCopyMD,
  scrollSelector = '.op-plan-wrap',
}) => {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const rafRef = React.useRef<number | null>(null);
  const syncingRef = React.useRef(false);
  // Gate position transitions: off during the initial mount settle (so cards
  // don't visibly fly in), on afterwards so hover/expand reflows glide.
  const animateRef = React.useRef(false);
  const hoverTimerRef = React.useRef<number | null>(null);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  // Small hover-intent delay: expanding a card reflows its neighbours, which can
  // slide another card under the cursor and bounce the hover between them.
  const handleEnter = React.useCallback((id: string) => {
    if (hoverTimerRef.current != null) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => setHoveredId(id), 70);
  }, []);
  const handleLeave = React.useCallback((id: string) => {
    if (hoverTimerRef.current != null) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    setHoveredId(h => (h === id ? null : h));
  }, []);
  React.useEffect(() => () => { if (hoverTimerRef.current != null) clearTimeout(hoverTimerRef.current); }, []);

  const getScrollEl = React.useCallback(
    () => document.querySelector(scrollSelector) as HTMLElement | null,
    [scrollSelector],
  );

  // Position cards at their anchor's absolute content Y; size the inner track
  // to match the document so the rail scrolls over the same range.
  const reflow = React.useCallback(() => {
    const viewport = viewportRef.current;
    const inner = innerRef.current;
    const scrollEl = getScrollEl();
    if (!viewport || !inner || !scrollEl) return;

    inner.style.height = `${scrollEl.scrollHeight}px`;
    const wrapTop = scrollEl.getBoundingClientRect().top;
    const scrollTop = scrollEl.scrollTop;

    type Item = { el: HTMLDivElement; h: number; anchor: number | null; top: number };
    const items: Item[] = [];
    for (const a of annotations) {
      const el = cardRefs.current.get(a.id);
      if (!el) continue;
      const mark = scrollEl.querySelector(`[data-bind-id="${a.id}"]`) as HTMLElement | null;
      const anchor = mark ? (mark.getBoundingClientRect().top - wrapTop) + scrollTop : null;
      items.push({ el, h: el.offsetHeight, anchor, top: 0 });
    }

    const anchored = items.filter(i => i.anchor != null).sort((x, y) => (x.anchor! - y.anchor!));
    const unanchored = items.filter(i => i.anchor == null);
    let cursor = -Infinity;
    for (const it of anchored) {
      let top = it.anchor!;
      if (cursor !== -Infinity && top < cursor + GAP) top = cursor + GAP;
      it.top = top;
      cursor = top + it.h;
    }
    for (const it of unanchored) {
      const top = cursor === -Infinity ? 0 : cursor + GAP;
      it.top = top;
      cursor = top + it.h;
    }
    const ease = 'top 0.18s cubic-bezier(0.22, 0.61, 0.36, 1)';
    for (const it of items) {
      // Animate only cards already placed once; a card's first placement (on
      // mount, or when added/late-anchored later) jumps straight to position so
      // nothing flies in from the top.
      const firstPlace = !it.el.dataset.placed;
      it.el.style.transition = (animateRef.current && !firstPlace) ? ease : 'none';
      it.el.style.top = `${Math.round(it.top)}px`;
      it.el.dataset.placed = '1';
    }

    // Grow the track if stacked cards extend past the document height.
    if (cursor !== -Infinity && cursor + PAD_BOTTOM > scrollEl.scrollHeight) {
      inner.style.height = `${Math.round(cursor + PAD_BOTTOM)}px`;
    }

    // Keep the rail aligned with the document.
    if (!syncingRef.current && Math.abs(viewport.scrollTop - scrollTop) > 1) {
      syncingRef.current = true;
      viewport.scrollTop = scrollTop;
      syncingRef.current = false;
    }
  }, [annotations, getScrollEl]);

  const scheduleReflow = React.useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; reflow(); });
  }, [reflow]);

  // Two-way scroll sync: doc → rail and rail → doc.
  React.useEffect(() => {
    const scrollEl = getScrollEl();
    const viewport = viewportRef.current;
    if (!scrollEl || !viewport) return;

    const onDocScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      viewport.scrollTop = scrollEl.scrollTop;
      syncingRef.current = false;
    };
    const onRailScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      scrollEl.scrollTop = viewport.scrollTop;
      syncingRef.current = false;
    };

    scrollEl.addEventListener('scroll', onDocScroll, { passive: true });
    viewport.addEventListener('scroll', onRailScroll, { passive: true });
    window.addEventListener('resize', scheduleReflow);
    const body = scrollEl.querySelector('.op-plan-body') ?? scrollEl;
    const ro = new ResizeObserver(scheduleReflow);
    ro.observe(body);
    // Enable glide only after the initial placement has settled.
    const animTimer = window.setTimeout(() => { animateRef.current = true; }, 420);
    return () => {
      scrollEl.removeEventListener('scroll', onDocScroll);
      viewport.removeEventListener('scroll', onRailScroll);
      window.removeEventListener('resize', scheduleReflow);
      ro.disconnect();
      clearTimeout(animTimer);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [getScrollEl, scheduleReflow]);

  // Reflow after render when layout inputs change; retry a couple of frames to
  // catch marks the editor inserts asynchronously.
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
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', borderRadius: 6, padding: '0 7px', minWidth: 18, textAlign: 'center' }}>{total}</span>
        <div style={{ flex: 1 }} />
        {onCopyMD && (
          <button onClick={onCopyMD} title="Copy as Markdown" style={{ fontSize: 12, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}>Copy MD</button>
        )}
        <button onClick={onClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-faint)', borderRadius: 6, display: 'inline-flex' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}>
          <Icon name="close" size={16} />
        </button>
      </div>

      {/* Scrollable anchored viewport */}
      <div ref={viewportRef} className="op-rail-viewport" style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {total === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>No comments yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Select text to add one.</div>
          </div>
        ) : (
          <div ref={innerRef} style={{ position: 'relative', width: '100%' }}>
            {annotations.map(a => {
              const expanded = a.id === focusId || a.id === hoveredId;
              return (
                <div
                  key={a.id}
                  ref={el => { if (el) cardRefs.current.set(a.id, el); else cardRefs.current.delete(a.id); }}
                  onMouseEnter={() => handleEnter(a.id)}
                  onMouseLeave={() => handleLeave(a.id)}
                  style={{
                    position: 'absolute', left: 10, right: 10, top: 0,
                    zIndex: expanded ? 5 : 1,
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
            })}
          </div>
        )}
      </div>
    </div>
  );
};
