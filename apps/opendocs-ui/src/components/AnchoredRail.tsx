import React from 'react';
import { AnnoCard } from '@openplan/annotations';
import type { Annotation } from '@openplan/shared';

export interface RailItem {
  id: string;
  anno: Annotation;
  resolved: boolean;
  orphaned: boolean;
  canEdit: boolean;
  canRemove: boolean;
}

interface Props {
  items: RailItem[];
  /** Document-space Y of each anchor (from the bridge), plus current scroll. */
  anchors: Record<string, number>;
  scrollTop: number;
  scrollHeight: number;
  focusId: string | null;
  canComment: boolean;
  onFocus: (id: string) => void;
  onEdit: (id: string, body: string) => void;
  onRemove: (id: string) => void;
  onResolve: (id: string) => void;
  onReply: (id: string, body: string) => void;
  onReact: (id: string, emoji: string) => void;
  onWheel: (dy: number) => void;
}

const GAP = 10;

/**
 * Comment cards laid out at the document-space position of their highlight, so a
 * card sits level with the words it refers to and moves with the page as it
 * scrolls. Overlaps are pushed down; the focused/hovered card expands. Cards
 * whose words are gone (orphaned) stack after the last anchored card.
 */
export const AnchoredRail: React.FC<Props> = ({ items, anchors, scrollTop, scrollHeight, focusId, canComment, onFocus, onEdit, onRemove, onResolve, onReply, onReact, onWheel }) => {
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const [hover, setHover] = React.useState<string | null>(null);
  const observers = React.useRef(new Map<string, ResizeObserver>());
  const hoverTimer = React.useRef<number>();

  const register = React.useCallback((id: string) => (el: HTMLDivElement | null) => {
    const prev = observers.current.get(id);
    if (prev) { prev.disconnect(); observers.current.delete(id); }
    if (!el) return;
    const measure = () => setHeights((h) => (Math.abs((h[id] ?? 0) - el.offsetHeight) > 1 ? { ...h, [id]: el.offsetHeight } : h));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    observers.current.set(id, ro);
  }, []);
  React.useEffect(() => () => { observers.current.forEach((o) => o.disconnect()); window.clearTimeout(hoverTimer.current); }, []);

  const tops = React.useMemo(() => {
    const anchored = items.filter((i) => anchors[i.id] != null).sort((a, b) => anchors[a.id] - anchors[b.id]);
    const loose = items.filter((i) => anchors[i.id] == null);
    const out: Record<string, number> = {};
    let cursor = -Infinity;
    for (const it of anchored) {
      let top = anchors[it.id] - 6;
      if (cursor !== -Infinity && top < cursor + GAP) top = cursor + GAP;
      out[it.id] = top;
      cursor = top + (heights[it.id] ?? 120);
    }
    for (const it of loose) {
      const top = cursor === -Infinity ? 0 : cursor + GAP;
      out[it.id] = top;
      cursor = top + (heights[it.id] ?? 120);
    }
    return { out, end: cursor === -Infinity ? 0 : cursor };
  }, [items, anchors, heights]);

  return (
    <div className="od-rail-viewport" onWheel={(e) => onWheel(e.deltaY)}>
      <div className="od-rail-track" style={{ height: Math.max(scrollHeight, tops.end + 80), transform: `translateY(${-scrollTop}px)` }}>
        {items.map((it) => {
          const expanded = focusId === it.id || hover === it.id;
          return (
            <div
              key={it.id}
              ref={register(it.id)}
              className={`od-rail-card ${expanded ? 'is-open' : ''}`}
              style={{ top: Math.round(tops.out[it.id] ?? 0) }}
              onMouseEnter={() => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setHover(it.id), 70); }}
              onMouseLeave={() => { window.clearTimeout(hoverTimer.current); setHover((h) => (h === it.id ? null : h)); }}
            >
              {it.orphaned && <div className="od-orphan">orphaned in this version</div>}
              <AnnoCard
                anno={it.anno}
                isFocus={focusId === it.id}
                expanded={expanded}
                onClick={() => onFocus(it.id)}
                onEdit={it.canEdit ? onEdit : undefined}
                onRemove={it.canRemove ? () => onRemove(it.id) : undefined}
                onResolve={canComment ? onResolve : undefined}
                onReply={canComment ? onReply : undefined}
                onReact={canComment ? onReact : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
