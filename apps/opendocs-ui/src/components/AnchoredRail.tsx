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
  /** Height of the panel header above the viewport, so cards line up with the document's top. */
  offset?: number;
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

const MeasuredCard: React.FC<{ id: string; onHeight: (id: string, h: number) => void; className?: string; style?: React.CSSProperties; onMouseEnter?: () => void; onMouseLeave?: () => void; children: React.ReactNode }> = ({ id, onHeight, children, ...rest }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    onHeight(id, el.offsetHeight);
    const ro = new ResizeObserver(() => onHeight(id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, onHeight]);
  return <div ref={ref} {...rest}>{children}</div>;
};

/**
 * Comment cards laid out at the document-space position of their highlight, so a
 * card sits level with the words it refers to and moves with the page as it
 * scrolls. Overlaps are pushed down; the focused/hovered card expands. Cards
 * whose words are gone (orphaned) stack after the last anchored card.
 */
export const AnchoredRail: React.FC<Props> = ({ items, anchors, scrollTop, scrollHeight, offset = 0, focusId, canComment, onFocus, onEdit, onRemove, onResolve, onReply, onReact, onWheel }) => {
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const [hover, setHover] = React.useState<string | null>(null);
  const hoverTimer = React.useRef<number>();
  React.useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  // Heights are reported from each card's own effect (never from a ref callback during
  // commit, which re-ran every render and could loop forever).
  const onHeight = React.useCallback((id: string, h: number) => {
    setHeights((prev) => (Math.abs((prev[id] ?? 0) - h) > 1 ? { ...prev, [id]: h } : prev));
  }, []);

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
      <div className="od-rail-track" style={{ height: Math.max(scrollHeight, tops.end + 80), transform: `translateY(${-(scrollTop + offset)}px)` }}>
        {items.map((it) => {
          const expanded = focusId === it.id || hover === it.id;
          return (
            <MeasuredCard
              key={it.id}
              id={it.id}
              onHeight={onHeight}
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
            </MeasuredCard>
          );
        })}
      </div>
    </div>
  );
};
