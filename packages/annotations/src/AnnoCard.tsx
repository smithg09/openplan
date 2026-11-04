import React from 'react';
import type { Annotation } from '@openplan/shared';
import { Pencil, Trash2, Check, CheckCheck, Reply, SmilePlus } from 'lucide-react';
import { AnnoIcon, ANNOTATION_TYPES } from './icons';

function relTime(iso: string): string {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const QUICK_REACTIONS = ['👍', '🎉', '❤️', '🚀', '👀'];

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '3px 5px',
  color: 'var(--text-faint)', borderRadius: 4, display: 'inline-flex', alignItems: 'center',
  transition: 'color 0.1s',
};

interface AnnoCardProps {
  anno: Annotation;
  isFocus: boolean;
  onClick: () => void;
  onEdit: (id: string, body: string) => void;
  onRemove: () => void;
  /** Toggle resolved. When omitted, the resolve control is hidden. */
  onResolve?: (id: string) => void;
  /** Add a threaded reply. When omitted, the reply composer is hidden. */
  onReply?: (id: string, body: string) => void;
  /** Toggle an emoji reaction. When omitted, the reaction control is hidden. */
  onReact?: (id: string, emoji: string) => void;
}

export const AnnoCard: React.FC<AnnoCardProps> = ({ anno, isFocus, onClick, onEdit, onRemove, onResolve, onReply, onReact }) => {
  const meta = ANNOTATION_TYPES[anno.type] ?? ANNOTATION_TYPES['comment'];
  const anchor = anno.selectedText ?? '';
  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(anno.body ?? '');
  const [replying, setReplying] = React.useState(false);
  const [replyValue, setReplyValue] = React.useState('');
  const [pickReaction, setPickReaction] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const replyRef = React.useRef<HTMLTextAreaElement>(null);
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

  React.useEffect(() => { if (replying) replyRef.current?.focus(); }, [replying]);

  const handleSave = () => { onEdit(anno.id, editValue); setEditing(false); };
  const handleReply = () => {
    if (replyValue.trim() && onReply) onReply(anno.id, replyValue.trim());
    setReplyValue('');
    setReplying(false);
  };

  const typeColor = `var(${meta.colorVar})`;
  const resolved = !!anno.resolved;
  const replies = anno.replies ?? [];
  const reactions = anno.reactions ?? [];

  return (
    <div
      ref={cardRef}
      onClick={editing ? undefined : onClick}
      style={{
        background: isFocus ? 'var(--bg-elevated)' : 'var(--bg-base)',
        border: `1px solid ${isFocus ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: editing ? 'default' : 'pointer',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s, opacity 0.15s',
        marginBottom: 1,
        opacity: resolved ? 0.6 : 1,
        boxShadow: isFocus ? `0 0 0 3px color-mix(in srgb, ${typeColor} 16%, transparent)` : 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span
          aria-hidden
          style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: typeColor,
            boxShadow: `0 0 0 3px color-mix(in srgb, ${typeColor} 18%, transparent)`,
          }}
        />
        <AnnoIcon type={anno.type} size={12} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: typeColor, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          {meta.label}
        </span>
        {resolved && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
            color: 'var(--teal)', background: 'color-mix(in srgb, var(--teal) 14%, transparent)',
            borderRadius: 10, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <CheckCheck size={10} strokeWidth={2} /> resolved
          </span>
        )}
        <div style={{ flex: 1 }} />
        {anno.author && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginRight: 4 }}>
            @{anno.author}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>
          {relTime(anno.createdAt)}{anno.edited ? ' · edited' : ''}
        </span>
      </div>

      {/* Quote */}
      {anchor && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 6,
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)',
          background: 'var(--bg-inset)', border: '1px solid var(--border)',
          borderLeft: `2px solid ${typeColor}`,
          borderRadius: 5, padding: '5px 8px', marginBottom: 7,
        }}>
          <span>{anchor.length > 72 ? anchor.slice(0, 70) + '…' : anchor}</span>
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
            <button onClick={e => { e.stopPropagation(); setEditing(false); }}
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
              cancel
            </button>
            <button onClick={e => { e.stopPropagation(); handleSave(); }}
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
              save
            </button>
          </div>
        </div>
      )}

      {/* Reactions */}
      {(reactions.length > 0 || (onReact && pickReaction)) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {reactions.map(r => (
            <button key={r.emoji} onClick={e => { e.stopPropagation(); onReact?.(anno.id, r.emoji); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, cursor: onReact ? 'pointer' : 'default',
                fontSize: 11, padding: '1px 6px', borderRadius: 10,
                border: `1px solid ${r.reactedByMe ? 'var(--accent)' : 'var(--border)'}`,
                background: r.reactedByMe ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-inset)',
                color: 'var(--text-secondary)',
              }}>
              <span>{r.emoji}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5 }}>{r.count}</span>
            </button>
          ))}
          {onReact && pickReaction && QUICK_REACTIONS.filter(e => !reactions.some(r => r.emoji === e)).map(e => (
            <button key={e} onClick={ev => { ev.stopPropagation(); onReact(anno.id, e); setPickReaction(false); }}
              style={{ fontSize: 12, padding: '1px 5px', borderRadius: 10, border: '1px dashed var(--border)', background: 'none', cursor: 'pointer' }}>
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 8, margin: '2px 0 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {replies.map(rep => (
            <div key={rep.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>@{rep.author}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-faint)' }}>{relTime(rep.createdAt)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{rep.body}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reply composer */}
      {onReply && replying && (
        <div style={{ marginBottom: 6 }}>
          <textarea
            ref={replyRef}
            value={replyValue}
            onChange={e => setReplyValue(e.target.value)}
            placeholder="Reply…"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') { setReplying(false); setReplyValue(''); }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleReply(); }
            }}
            style={{
              width: '100%', minHeight: 48, resize: 'vertical',
              background: 'var(--bg-inset)', border: '1px solid var(--border)',
              borderRadius: 5, padding: '6px 8px', fontSize: 12,
              fontFamily: 'var(--font-sans)', color: 'var(--text-primary)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 5, justifyContent: 'flex-end' }}>
            <button onClick={e => { e.stopPropagation(); setReplying(false); setReplyValue(''); }}
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
              cancel
            </button>
            <button onClick={e => { e.stopPropagation(); handleReply(); }} disabled={!replyValue.trim()}
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
              reply
            </button>
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4 }}>
        {!editing && anno.type !== 'emoji' && anno.type !== 'deletion' && (
          <button title="Edit" style={iconBtn}
            onClick={e => { e.stopPropagation(); setEditing(true); }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}>
            <Pencil size={12} strokeWidth={1.6} />
          </button>
        )}
        {onReply && (
          <button title="Reply" style={iconBtn}
            onClick={e => { e.stopPropagation(); setReplying(v => !v); }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}>
            <Reply size={13} strokeWidth={1.6} />
          </button>
        )}
        {onReact && (
          <button title="React" style={iconBtn}
            onClick={e => { e.stopPropagation(); setPickReaction(v => !v); }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}>
            <SmilePlus size={13} strokeWidth={1.6} />
          </button>
        )}
        {onResolve && (
          <button title={resolved ? 'Reopen' : 'Resolve'} style={{ ...iconBtn, color: resolved ? 'var(--teal)' : 'var(--text-faint)' }}
            onClick={e => { e.stopPropagation(); onResolve(anno.id); }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--teal)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = resolved ? 'var(--teal)' : 'var(--text-faint)'; }}>
            {resolved ? <CheckCheck size={13} strokeWidth={1.8} /> : <Check size={13} strokeWidth={1.8} />}
          </button>
        )}
        <button title="Remove" style={iconBtn}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; }}>
          <Trash2 size={12} strokeWidth={1.6} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-faint)', opacity: 0.6 }}>
          #{anno.id.slice(-6)}
        </span>
      </div>
    </div>
  );
};
