import React from 'react';
import type { Annotation } from '@openplan/shared';
import { SmilePlus, Reply, Link2, Pencil, Trash2, CircleCheck } from 'lucide-react';
import { AnnoIcon, ANNOTATION_TYPES } from './icons';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatAdded(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `Added ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} at ${h}:${m} ${ap}`;
}

const QUICK_REACTIONS = ['👍', '🎉', '❤️', '🚀', '👀'];

interface AnnoCardProps {
  anno: Annotation;
  isFocus: boolean;
  onClick: () => void;
  onEdit: (id: string, body: string) => void;
  onRemove: () => void;
  onResolve?: (id: string) => void;
  onReply?: (id: string, body: string) => void;
  onReact?: (id: string, emoji: string) => void;
  onCopyLink?: (id: string) => void;
  /** Collapsed form used by the anchored rail for non-active cards. */
  expanded?: boolean;
}

export const AnnoCard: React.FC<AnnoCardProps> = ({
  anno, isFocus, onClick, onEdit, onRemove, onResolve, onReply, onReact, onCopyLink, expanded = true,
}) => {
  const meta = ANNOTATION_TYPES[anno.type] ?? ANNOTATION_TYPES['comment'];
  const anchor = anno.selectedText ?? '';
  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(anno.body ?? '');
  const [replying, setReplying] = React.useState(false);
  const [replyValue, setReplyValue] = React.useState('');
  const [pickReaction, setPickReaction] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const replyRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => { if (editing) { setEditValue(anno.body ?? ''); textareaRef.current?.focus(); } }, [editing, anno.body]);
  React.useEffect(() => { if (replying) replyRef.current?.focus(); }, [replying]);

  const handleSave = () => { onEdit(anno.id, editValue); setEditing(false); };
  const handleReply = () => {
    if (replyValue.trim() && onReply) onReply(anno.id, replyValue.trim());
    setReplyValue(''); setReplying(false);
  };

  const typeColor = `var(${meta.colorVar})`;
  const resolved = !!anno.resolved;
  const replies = anno.replies ?? [];
  const reactions = anno.reactions ?? [];
  const author = anno.author || 'You';

  const pill: React.CSSProperties = {
    fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, borderRadius: 999,
    padding: '2px 11px', lineHeight: 1.5,
    color: resolved ? 'var(--teal)' : 'var(--accent)',
    background: resolved ? 'color-mix(in srgb, var(--teal) 14%, transparent)' : 'color-mix(in srgb, var(--accent) 14%, transparent)',
  };
  const ftBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 6,
    color: 'var(--text-faint)', borderRadius: 6, display: 'inline-flex', alignItems: 'center',
    transition: 'color 0.12s, background 0.12s',
  };
  const hoverable = (el: HTMLElement, c: string) => { el.style.color = c; el.style.background = 'var(--bg-inset)'; };
  const unhover = (el: HTMLElement, c: string) => { el.style.color = c; el.style.background = 'none'; };

  // ── Header (shared by compact + expanded) ──────────────────────────────────
  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ color: typeColor, display: 'inline-flex', marginTop: 2 }}><AnnoIcon type={anno.type} size={15} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {author}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 1 }}>
          {formatAdded(anno.createdAt)}{anno.edited ? ' · edited' : ''}
        </div>
      </div>
      <span style={pill}>{resolved ? 'resolved' : 'open'}</span>
    </div>
  );

  // ── Compact (rail, non-active) ─────────────────────────────────────────────
  if (!expanded) {
    const preview = anno.type === 'emoji' ? anno.emoji
      : anno.type === 'suggestion' ? (anno.suggestion || anno.body)
      : (anno.body || (anchor ? `“${anchor}”` : 'no comment'));
    return (
      <div onClick={onClick} style={{
        background: 'var(--bg-elevated)', border: `1px solid ${isFocus ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 8, padding: '10px 12px', cursor: 'pointer', opacity: resolved ? 0.55 : 1,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: typeColor, display: 'inline-flex' }}><AnnoIcon type={anno.type} size={13} /></span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{author}</span>
          <div style={{ flex: 1 }} />
          <span style={{ ...pill, fontSize: 11, padding: '1px 8px' }}>{resolved ? 'resolved' : 'open'}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {preview}
        </div>
        {(replies.length > 0 || reactions.length > 0) && (
          <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11, color: 'var(--text-faint)' }}>
            {replies.length > 0 && <span>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>}
            {reactions.length > 0 && <span>{reactions.map(r => r.emoji).join(' ')}</span>}
          </div>
        )}
      </div>
    );
  }

  // ── Expanded ───────────────────────────────────────────────────────────────
  return (
    <div onClick={editing ? undefined : onClick} style={{
      background: 'var(--bg-elevated)',
      border: `1px solid ${isFocus ? 'var(--border-strong)' : 'var(--border)'}`,
      borderRadius: 8, padding: 16, cursor: editing ? 'default' : 'pointer',
      transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
      opacity: resolved ? 0.62 : 1,
      boxShadow: isFocus ? `0 6px 20px -8px rgba(0,0,0,0.35), 0 0 0 3px color-mix(in srgb, ${typeColor} 14%, transparent)` : '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {header}

      {/* Quote */}
      {anchor && (
        <div style={{
          margin: '12px 0 10px', paddingLeft: 12, borderLeft: `3px solid ${typeColor}`,
          color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55,
        }}>
          {anchor.length > 240 ? anchor.slice(0, 238) + '…' : anchor}
        </div>
      )}

      {/* Body */}
      {!editing ? (
        anno.type === 'emoji' ? (
          <div style={{ fontSize: 26, lineHeight: 1.3, marginBottom: 4 }}>{anno.emoji}</div>
        ) : anno.type === 'suggestion' ? (
          <div style={{ fontSize: 13.5, marginBottom: 4 }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ color: 'var(--danger)', opacity: 0.8, marginTop: 1 }}>–</span>
              <span style={{ color: 'var(--text-secondary)', textDecoration: 'line-through' }}>{anchor.length > 60 ? anchor.slice(0, 58) + '…' : anchor}</span>
            </div>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--teal)', marginTop: 1 }}>+</span>
              <span style={{ color: 'var(--teal)' }}>{anno.suggestion}</span>
            </div>
            {anno.body && <div style={{ marginTop: 7, color: 'var(--text-secondary)' }}>{anno.body}</div>}
          </div>
        ) : (
          <div style={{ fontSize: 14, lineHeight: 1.5, color: anno.body ? 'var(--text-primary)' : 'var(--text-faint)', fontStyle: anno.body ? 'normal' : 'italic', marginBottom: 4 }}>
            {anno.body || (anno.type === 'deletion' ? 'Remove this section.' : 'no comment')}
          </div>
        )
      ) : (
        <div style={{ marginBottom: 6 }}>
          <textarea ref={textareaRef} value={editValue} onChange={e => setEditValue(e.target.value)} onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); } }}
            style={{ width: '100%', minHeight: 70, resize: 'vertical', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 14, fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
            <button onClick={e => { e.stopPropagation(); setEditing(false); }} style={{ fontSize: 12.5, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>Cancel</button>
            <button onClick={e => { e.stopPropagation(); handleSave(); }} style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 12px' }}>Save</button>
          </div>
        </div>
      )}

      {/* Reactions */}
      {(reactions.length > 0 || (onReact && pickReaction)) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
          {reactions.map(r => (
            <button key={r.emoji} onClick={e => { e.stopPropagation(); onReact?.(anno.id, r.emoji); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: onReact ? 'pointer' : 'default', fontSize: 12.5, padding: '2px 8px', borderRadius: 6, border: `1px solid ${r.reactedByMe ? 'var(--accent)' : 'var(--border)'}`, background: r.reactedByMe ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-inset)', color: 'var(--text-secondary)' }}>
              <span>{r.emoji}</span><span style={{ fontSize: 11 }}>{r.count}</span>
            </button>
          ))}
          {onReact && pickReaction && QUICK_REACTIONS.filter(e => !reactions.some(r => r.emoji === e)).map(e => (
            <button key={e} onClick={ev => { ev.stopPropagation(); onReact(anno.id, e); setPickReaction(false); }}
              style={{ fontSize: 13, padding: '2px 7px', borderRadius: 6, border: '1px dashed var(--border)', background: 'none', cursor: 'pointer' }}>{e}</button>
          ))}
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 10, margin: '10px 0 2px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {replies.map(rep => (
            <div key={rep.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 1 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{rep.author}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{formatAdded(rep.createdAt).replace('Added ', '')}</span>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{rep.body}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reply composer */}
      {onReply && replying && (
        <div style={{ marginTop: 10 }}>
          <textarea ref={replyRef} value={replyValue} onChange={e => setReplyValue(e.target.value)} placeholder="Reply…" onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Escape') { setReplying(false); setReplyValue(''); } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleReply(); } }}
            style={{ width: '100%', minHeight: 52, resize: 'vertical', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13.5, fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
            <button onClick={e => { e.stopPropagation(); setReplying(false); setReplyValue(''); }} style={{ fontSize: 12.5, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>Cancel</button>
            <button onClick={e => { e.stopPropagation(); handleReply(); }} disabled={!replyValue.trim()} style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 6, cursor: 'pointer', padding: '4px 12px', opacity: replyValue.trim() ? 1 : 0.5 }}>Reply</button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {onReact && (
          <button title="React" style={ftBtn} onClick={e => { e.stopPropagation(); setPickReaction(v => !v); }}
            onMouseEnter={e => hoverable(e.currentTarget, 'var(--text-secondary)')} onMouseLeave={e => unhover(e.currentTarget, 'var(--text-faint)')}>
            <SmilePlus size={17} strokeWidth={1.7} />
          </button>
        )}
        <div style={{ flex: 1 }} />
        {onReply && (
          <button title="Reply" style={ftBtn} onClick={e => { e.stopPropagation(); setReplying(v => !v); }}
            onMouseEnter={e => hoverable(e.currentTarget, 'var(--text-secondary)')} onMouseLeave={e => unhover(e.currentTarget, 'var(--text-faint)')}>
            <Reply size={17} strokeWidth={1.7} />
          </button>
        )}
        {onCopyLink && (
          <button title="Copy link" style={ftBtn} onClick={e => { e.stopPropagation(); onCopyLink(anno.id); }}
            onMouseEnter={e => hoverable(e.currentTarget, 'var(--text-secondary)')} onMouseLeave={e => unhover(e.currentTarget, 'var(--text-faint)')}>
            <Link2 size={17} strokeWidth={1.7} />
          </button>
        )}
        {anno.type !== 'emoji' && anno.type !== 'deletion' && (
          <button title="Edit" style={ftBtn} onClick={e => { e.stopPropagation(); setEditing(true); }}
            onMouseEnter={e => hoverable(e.currentTarget, 'var(--text-secondary)')} onMouseLeave={e => unhover(e.currentTarget, 'var(--text-faint)')}>
            <Pencil size={16} strokeWidth={1.7} />
          </button>
        )}
        <button title="Remove" style={ftBtn} onClick={e => { e.stopPropagation(); onRemove(); }}
          onMouseEnter={e => hoverable(e.currentTarget, 'var(--danger)')} onMouseLeave={e => unhover(e.currentTarget, 'var(--text-faint)')}>
          <Trash2 size={16} strokeWidth={1.7} />
        </button>
        {onResolve && (
          <button title={resolved ? 'Reopen' : 'Resolve'} style={{ ...ftBtn, color: resolved ? 'var(--teal)' : 'var(--text-faint)' }} onClick={e => { e.stopPropagation(); onResolve(anno.id); }}
            onMouseEnter={e => hoverable(e.currentTarget, 'var(--teal)')} onMouseLeave={e => unhover(e.currentTarget, resolved ? 'var(--teal)' : 'var(--text-faint)')}>
            <CircleCheck size={18} strokeWidth={1.7} />
          </button>
        )}
      </div>
    </div>
  );
};
