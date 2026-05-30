import React from 'react';
import { AnnoIcon, ANNOTATION_TYPES } from './icons';

const TYPES = ['comment', 'deletion', 'suggestion', 'question', 'emoji'] as const;
const REACTIONS = ['👍', '👎', '❤️', '🔥'];

interface SelectionToolbarProps {
  pos: { x: number; y: number };
  onAction: (type: string, meta?: { emoji?: string }) => void;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({ pos, onAction }) => {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [showReactions, setShowReactions] = React.useState(false);

  React.useEffect(() => {
    if (!showReactions) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.op-sel-toolbar')) setShowReactions(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showReactions]);

  return (
    <div className="op-sel-toolbar" style={{ left: pos.x, top: pos.y }}>
      {TYPES.map(type => {
        const isEmoji = type === 'emoji';
        return (
          <div key={type} style={{ position: 'relative' }}>
            <button
              className="op-sel-btn"
              onMouseEnter={() => setHovered(type)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                if (isEmoji) {
                  setShowReactions(s => !s);
                } else {
                  onAction(type);
                }
              }}
              style={{ width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <AnnoIcon type={type} size={14} />
            </button>

            {hovered === type && !showReactions && (
              <span style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4,
                padding: '2px 7px', fontSize: 10.5, fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)', whiteSpace: 'nowrap', pointerEvents: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 10,
              }}>
                {ANNOTATION_TYPES[type].label}
              </span>
            )}

            {isEmoji && showReactions && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '6px 8px', display: 'flex', gap: 4, zIndex: 20,
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
              }}>
                {REACTIONS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={e => {
                      e.stopPropagation();
                      onAction('emoji', { emoji });
                      setShowReactions(false);
                    }}
                    style={{
                      fontSize: 20, background: 'none', border: 'none', cursor: 'pointer',
                      padding: '4px 6px', borderRadius: 6, lineHeight: 1,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.background = 'none'; }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
