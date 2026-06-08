import React from 'react';
import type { Annotation } from '@openplan/shared';
import { AnnoIcon, ANNOTATION_TYPES } from './icons';

function relTime(iso: string): string {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const PencilIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 1.5l2 2-7 7H1.5v-2z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h8" /><path d="M4.5 3V2h3v1" />
    <path d="M3.5 3l.5 7h4l.5-7" />
    <path d="M5 5.5v3M7 5.5v3" />
  </svg>
);

interface AnnoCardProps {
  anno: Annotation;
  isFocus: boolean;
  onClick: () => void;
  onEdit: (id: string, body: string) => void;
  onRemove: () => void;
}

export const AnnoCard: React.FC<AnnoCardProps> = ({ anno, isFocus, onClick, onEdit, onRemove }) => {
  const meta = ANNOTATION_TYPES[anno.type] ?? ANNOTATION_TYPES['comment'];
  const anchor = anno.selectedText ?? '';
  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(anno.body ?? '');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isFocus && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isFocus]);

  React.useEffect(() => {
    if (editing) {
      setEditValue(anno.body ?? '');
      textareaRef.current?.focus();
    }
  }, [editing, anno.body]);

  const handleSave = () => {
    onEdit(anno.id, editValue);
    setEditing(false);
  };

  const typeColor = `var(${meta.colorVar})`;

  return (
    <div
      ref={cardRef}
      onClick={editing ? undefined : onClick}
      style={{
        background: isFocus ? 'var(--bg-elevated)' : 'var(--bg-base)',
        border: `1px solid ${isFocus ? 'var(--border-strong)' : 'var(--border)'}`,
        borderLeft: `3px solid ${typeColor}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: editing ? 'default' : 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        marginBottom: 1,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <AnnoIcon type={anno.type} size={12} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: typeColor, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          {meta.label}
        </span>
        <div style={{ flex: 1 }} />
        {anno.author && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginRight: 4 }}>
            @{anno.author}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>
          {relTime(anno.createdAt)}
        </span>
      </div>

      {/* Quote */}
      {anchor && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
          background: 'var(--bg-inset)', borderRadius: 4, padding: '4px 8px',
          marginBottom: 7, borderLeft: `2px solid ${typeColor}`, opacity: 0.85,
        }}>
          "{anchor.length > 72 ? anchor.slice(0, 70) + '…' : anchor}"
        </div>
      )}

      {/* Body content */}
      {!editing ? (
        <>
          {anno.type === 'emoji' ? (
            <div style={{ fontSize: 22, lineHeight: 1.4, marginBottom: 6 }}>{anno.emoji}</div>
          ) : anno.type === 'suggestion' ? (
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--danger)', opacity: 0.7, marginTop: 1 }}>–</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'line-through' }}>
                  {anchor.length > 50 ? anchor.slice(0, 48) + '…' : anchor}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--teal)', marginTop: 1 }}>+</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--teal)' }}>{anno.suggestion}</span>
              </div>
              {anno.body && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>{anno.body}</div>
              )}
            </div>
          ) : anno.type === 'deletion' ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              {anno.body || 'Remove this section.'}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: anno.body ? 'var(--text-primary)' : 'var(--text-faint)', marginBottom: 6, fontStyle: anno.body ? 'normal' : 'italic' }}>
              {anno.body || 'no comment'}
            </div>
          )}
        </>
      ) : (
        <div style={{ marginBottom: 6 }}>
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setEditing(false);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            }}
            style={{
              width: '100%', minHeight: 64, resize: 'vertical',
              background: 'var(--bg-inset)', border: '1px solid var(--border)',
              borderRadius: 5, padding: '6px 8px', fontSize: 12,
              fontFamily: 'var(--font-sans)', color: 'var(--text-primary)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 5, justifyContent: 'flex-end' }}>
            <button
              onClick={e => { e.stopPropagation(); setEditing(false); }}
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            >
              cancel
            </button>
            <button
              onClick={e => { e.stopPropagation(); handleSave(); }}
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            >
              save
            </button>
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        {!editing && anno.type !== 'emoji' && anno.type !== 'deletion' && (
          <button
            title="Edit"
            onClick={e => { e.stopPropagation(); setEditing(true); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
              color: 'var(--text-faint)', borderRadius: 4, display: 'flex', alignItems: 'center',
              transition: 'color 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget).style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { (e.currentTarget).style.color = 'var(--text-faint)'; }}
          >
            <PencilIcon />
          </button>
        )}
        <button
          title="Remove"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
            color: 'var(--text-faint)', borderRadius: 4, display: 'flex', alignItems: 'center',
            transition: 'color 0.1s',
          }}
          onMouseEnter={e => { (e.currentTarget).style.color = 'var(--danger)'; }}
          onMouseLeave={e => { (e.currentTarget).style.color = 'var(--text-faint)'; }}
        >
          <TrashIcon />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-faint)', opacity: 0.6 }}>
          #{anno.id.slice(-6)}
        </span>
      </div>
    </div>
  );
};
