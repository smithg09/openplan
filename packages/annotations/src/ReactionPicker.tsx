import React from 'react';
import { Icon } from './icons';

export const REACTION_CHOICES: { emoji: string; label: string }[] = [
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '👎', label: 'Thumbs down' },
  { emoji: '😄', label: 'Laughing' },
  { emoji: '🎉', label: 'Celebrate' },
  { emoji: '😕', label: 'Confused' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '🚀', label: 'Ship it' },
  { emoji: '👀', label: 'Looking' },
];

/**
 * Floating "Add a reaction" popover: a 3x3 grid of reactions with the hovered
 * one named underneath; the last cell opens a field for any other emoji.
 */
export const ReactionPicker: React.FC<{
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Where the popover opens relative to its anchor. */
  placement?: 'above' | 'below';
}> = ({ onPick, onClose, placement = 'above' }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [hover, setHover] = React.useState<string>('');
  const [custom, setCustom] = React.useState(false);
  const [value, setValue] = React.useState('');

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div ref={ref} className={`op-react-pop op-react-${placement}`} role="dialog" aria-label="Add a reaction" onClick={e => e.stopPropagation()}>
      <div className="op-react-title">Add a reaction</div>
      <div className="op-react-grid">
        {REACTION_CHOICES.map(r => (
          <button key={r.emoji} className="op-react-cell" onMouseEnter={() => setHover(r.label)} onMouseLeave={() => setHover('')}
            onClick={() => { onPick(r.emoji); onClose(); }} aria-label={r.label}>{r.emoji}</button>
        ))}
        <button className="op-react-cell op-react-more" onMouseEnter={() => setHover('Any emoji')} onMouseLeave={() => setHover('')}
          onClick={() => setCustom(c => !c)} aria-label="Any emoji"><Icon name="add" size={18} /></button>
      </div>
      {custom ? (
        <form className="op-react-custom" onSubmit={e => { e.preventDefault(); const v = value.trim(); if (v) { onPick(v); onClose(); } }}>
          <input autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder="Type or paste an emoji" maxLength={8} />
          <button type="submit" disabled={!value.trim()}>Add</button>
        </form>
      ) : (
        <div className="op-react-label">{hover || 'Pick one'}</div>
      )}
    </div>
  );
};
