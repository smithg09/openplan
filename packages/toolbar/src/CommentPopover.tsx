import React from 'react';
import { AnnoIcon, ANNOTATION_TYPES } from './icons';

interface CommentPopoverProps {
  pos: { x: number; y: number };
  type: string;
  quote: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}

export const CommentPopover: React.FC<CommentPopoverProps> = ({ pos, type, quote, onSave, onCancel }) => {
  const [value, setValue] = React.useState('');
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { ref.current?.focus(); }, []);

  const label = ANNOTATION_TYPES[type]?.label ?? 'Note';

  return (
    <div className="op-popover" style={{ left: pos.x, top: pos.y }}>
      <div className="op-popover-head">
        <AnnoIcon type={type} size={12} />
        <span>{label}</span>
      </div>
      <div className="op-popover-quote">"{quote.length > 80 ? quote.slice(0, 78) + '…' : quote}"</div>
      <textarea
        ref={ref}
        className="op-popover-input"
        placeholder={type === 'question' ? 'Ask Claude…' : 'Add a comment…'}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(value);
        }}
      />
      <div className="op-popover-actions">
        <span className="op-popover-hint">⌘↵ save · esc cancel</span>
        <div className="op-row">
          <button className="op-btn op-btn-ghost op-btn-sm" onClick={onCancel}>Cancel</button>
          <button className="op-btn op-btn-primary op-btn-sm" onClick={() => onSave(value)} disabled={!value.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
};
