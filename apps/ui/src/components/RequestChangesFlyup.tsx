import React from 'react';
import { Button } from './Primitives';
import { useStore } from '../store';

interface RequestChangesFlyupProps {
  onCancel: () => void;
  onSend: (text: string, includeEdits: boolean) => void;
}

export const RequestChangesFlyup: React.FC<RequestChangesFlyupProps> = ({ onCancel, onSend }) => {
  const { hasEdits } = useStore();
  const [text, setText] = React.useState('');
  const [includeEdits, setIncludeEdits] = React.useState(true);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="op-flyup">
      <div className="op-row">
        <span className="op-mono" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          // request changes from claude
        </span>
        <div className="op-grow" />
        <span className="op-mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>⌘↵ send · esc cancel</span>
      </div>
      <textarea
        ref={ref}
        className="op-flyup-textarea"
        placeholder="Leave an overall comment (optional)…"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSend(text, includeEdits); }
        }}
      />
      <div className="op-row">
        {hasEdits && (
          <label className="op-row" style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={includeEdits}
              onChange={e => setIncludeEdits(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            include my inline edits
          </label>
        )}
        <div className="op-grow" />
        <Button kind="ghost" size="md" onClick={onCancel}>cancel</Button>
        <Button kind="primary" size="md" onClick={() => onSend(text, includeEdits)}>
          request changes →
        </Button>
      </div>
    </div>
  );
};
