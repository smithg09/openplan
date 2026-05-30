import React from 'react';
import type { Annotation } from '@openplan/shared';
import { AnnoCard } from './AnnoCard';
import { AnnoIcon } from './icons';

const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'comment',   label: 'Comments' },
  { id: 'deletion',  label: 'Deletes' },
  { id: 'suggestion',label: 'Suggests' },
  { id: 'question',  label: 'Questions' },
  { id: 'emoji',     label: 'Reactions' },
];

interface AnnotationsPanelProps {
  annotations: Annotation[];
  focusId: string | null;
  onFocus: (id: string) => void;
  onEdit: (id: string, body: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onCopyMD?: () => void;
}

export const AnnotationsPanel: React.FC<AnnotationsPanelProps> = ({
  annotations, focusId, onFocus, onEdit, onRemove, onClose, onCopyMD,
}) => {
  const [filter, setFilter] = React.useState('all');

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const a of annotations) {
      c['all'] = (c['all'] ?? 0) + 1;
      c[a.type] = (c[a.type] ?? 0) + 1;
    }
    return c;
  }, [annotations]);

  const visible = annotations.filter(a => filter === 'all' || a.type === filter);

  return (
    <div className="op-annopanel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 10px',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          // annotations
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
          color: 'var(--accent)', minWidth: 16, textAlign: 'center',
        }}>
          {counts['all'] ?? 0}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
            color: 'var(--text-faint)', borderRadius: 4, display: 'flex', alignItems: 'center',
            lineHeight: 1,
          }}
          onMouseEnter={e => { (e.currentTarget).style.color = 'var(--text-secondary)'; }}
          onMouseLeave={e => { (e.currentTarget).style.color = 'var(--text-faint)'; }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 2, padding: '8px 10px 6px', overflowX: 'auto',
        borderBottom: '1px solid var(--border)',
        scrollbarWidth: 'none',
      }}>
        {TABS.map(t => {
          const count = counts[t.id] ?? 0;
          const active = filter === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10.5, whiteSpace: 'nowrap',
                background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                color: active ? '#fff' : 'var(--text-muted)',
                fontWeight: active ? 600 : 400,
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              {t.id !== 'all' && <AnnoIcon type={t.id} size={10} />}
              <span>{t.label}</span>
              {count > 0 && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, lineHeight: 1,
                  color: active ? 'rgba(255,255,255,0.85)' : 'var(--text-faint)',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {visible.length === 0 ? (
          <div style={{ padding: '32px 12px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>
              // no annotations
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Select text in the plan to add one.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visible.map(a => (
              <AnnoCard
                key={a.id}
                anno={a}
                isFocus={focusId === a.id}
                onClick={() => onFocus(a.id)}
                onEdit={onEdit}
                onRemove={() => onRemove(a.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--border)', padding: '8px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      }}>
        <button
          onClick={onCopyMD}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)',
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
          }}
          onMouseEnter={e => { (e.currentTarget).style.color = 'var(--text-secondary)'; }}
          onMouseLeave={e => { (e.currentTarget).style.color = 'var(--text-faint)'; }}
        >
          Copy as MD
        </button>
      </div>
    </div>
  );
};
