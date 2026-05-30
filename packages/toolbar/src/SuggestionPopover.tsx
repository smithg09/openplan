import React from 'react';
import { AnnoIcon } from './icons';

interface SuggestionPopoverProps {
  pos: { x: number; y: number };
  quote: string;
  onSave: (body: string, suggestion: string) => void;
  onCancel: () => void;
}

export const SuggestionPopover: React.FC<SuggestionPopoverProps> = ({ pos, quote, onSave, onCancel }) => {
  const [body, setBody] = React.useState('');
  const [suggestion, setSuggestion] = React.useState('');
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="op-popover" style={{ left: pos.x, top: pos.y, minWidth: 320 }}>
      <div className="op-popover-head">
        <AnnoIcon type="suggestion" size={12} />
        <span>Suggest edit</span>
      </div>
      <div className="op-popover-quote">"{quote.length > 80 ? quote.slice(0, 78) + '…' : quote}"</div>
      <div style={{ marginBottom: 6, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>// replacement text</div>
      <textarea
        ref={ref}
        className="op-popover-input"
        placeholder="Suggested replacement…"
        value={suggestion}
        onChange={e => setSuggestion(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') onCancel();
        }}
        style={{ marginBottom: 8 }}
      />
      <textarea
        className="op-popover-input"
        placeholder="Rationale (optional)…"
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(body, suggestion);
        }}
        style={{ minHeight: 48 }}
      />
      <div className="op-popover-actions">
        <span className="op-popover-hint">⌘↵ save · esc cancel</span>
        <div className="op-row">
          <button className="op-btn op-btn-ghost op-btn-sm" onClick={onCancel}>Cancel</button>
          <button className="op-btn op-btn-primary op-btn-sm" onClick={() => onSave(body, suggestion)} disabled={!suggestion.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
};
