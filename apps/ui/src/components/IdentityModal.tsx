import React from 'react';
import { Button } from './Primitives';

interface IdentityModalProps {
  soft?: boolean;
  initialName?: string;
  onConfirm: (name: string) => void;
  onDismiss: () => void;
}

export const IdentityModal: React.FC<IdentityModalProps> = ({ soft, initialName, onConfirm, onDismiss }) => {
  const [name, setName] = React.useState(initialName ?? '');

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
      if (e.key === 'Enter' && name.trim()) onConfirm(name.trim());
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [name, onConfirm, onDismiss]);

  return (
    <div className="op-overlay" onClick={soft ? onDismiss : undefined}>
      <div className="op-modal" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
        <div className="op-modal-head">
          <span className="op-modal-title">// who are you?</span>
          {soft && <Button kind="ghost" size="sm" onClick={onDismiss}>×</Button>}
        </div>
        <div className="op-modal-body">
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
            {soft
              ? 'Save your name so others can identify your annotations.'
              : 'Your name will appear on annotations you create.'}
          </p>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="your name"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              borderRadius: 5, padding: '7px 10px',
              fontFamily: 'var(--font-mono)', fontSize: 13,
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>
        <div className="op-modal-foot">
          {soft && (
            <Button kind="ghost" size="md" onClick={onDismiss}>skip</Button>
          )}
          <div className="op-grow" />
          <Button
            kind="primary"
            size="md"
            onClick={() => name.trim() && onConfirm(name.trim())}
          >
            save
          </Button>
        </div>
      </div>
    </div>
  );
};
