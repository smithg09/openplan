import React from 'react';
import { Button } from './Primitives';
import type { Annotation } from '@openplan/shared';
import { encodeSharePayload } from '../lib/share';

interface ShareDialogProps {
  plan: string;
  annotations: Annotation[];
  title: string;
  onClose: () => void;
}

const BASE_URL = 'https://openplan.smithgajjar.dev/app';

export const ShareDialog: React.FC<ShareDialogProps> = ({ plan, annotations, title, onClose }) => {
  const [include, setInclude] = React.useState('all');
  const [url, setUrl] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const filtered =
      include === 'plan' ? [] :
      include === 'resolved' ? annotations.filter(a => a.resolved) :
      annotations;

    encodeSharePayload({ version: 1, title, plan, annotations: filtered }).then(hash => {
      if (!cancelled) setUrl(BASE_URL + hash);
    });
    return () => { cancelled = true; };
  }, [include, plan, annotations, title]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const copy = () => {
    if (!url) return;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="op-overlay" onClick={onClose}>
      <div className="op-modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="op-modal-head">
          <span className="op-modal-title">// share plan</span>
          <Button kind="ghost" size="sm" onClick={onClose}>×</Button>
        </div>
        <div className="op-modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {[
              { id: 'plan', label: 'Plan only' },
              { id: 'all', label: 'Plan + all annotations' },
              { id: 'resolved', label: 'Plan + resolved annotations only' },
            ].map(o => (
              <label key={o.id} className="op-row" style={{ padding: '6px 0', cursor: 'pointer' }}>
                <span style={{
                  width: 12, height: 12, borderRadius: '50%',
                  border: `1.5px solid ${include === o.id ? 'var(--accent)' : 'var(--border-strong)'}`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {include === o.id && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
                </span>
                <input type="radio" checked={include === o.id} onChange={() => setInclude(o.id)} style={{ display: 'none' }} />
                <span style={{ fontSize: 13 }}>{o.label}</span>
              </label>
            ))}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            borderRadius: 5, padding: '0 0 0 10px',
            fontFamily: 'var(--font-mono)', fontSize: 11.5,
          }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: url ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {url || 'generating…'}
            </span>
            <Button kind="ghost" size="sm" onClick={copy} style={{ borderLeft: '1px solid var(--border)', borderRadius: 0 }}>
              {copied ? 'copied ✓' : 'copy'}
            </Button>
          </div>
          <div style={{
            marginTop: 12, padding: '8px 10px',
            background: 'color-mix(in oklab, var(--warning) 10%, transparent)',
            borderRadius: 5, fontSize: 11.5,
            color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
          }}>
            ⚠ link contains full plan text · anyone with the link can view
          </div>
        </div>
        <div className="op-modal-foot">
          <div className="op-grow" />
          <Button kind="outline" size="md" onClick={onClose}>close</Button>
        </div>
      </div>
    </div>
  );
};
