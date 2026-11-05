import React from 'react';
import { Drawer, CopyButton, Icon } from '@openplan/chrome';
import type { Annotation } from '@openplan/shared';
import { encodeSharePayload } from '../lib/share';

interface ShareDialogProps {
  plan: string;
  annotations: Annotation[];
  title: string;
  onClose: () => void;
}

const BASE_URL = 'https://openplan.smithgajjar.dev/app';

const OPTIONS = [
  { id: 'plan', label: 'Plan only', sub: 'Just the markdown, no comments.' },
  { id: 'all', label: 'Plan and all annotations', sub: 'Everything on the page right now.' },
  { id: 'resolved', label: 'Plan and resolved annotations', sub: 'Leave open threads out.' },
];

/** Share a plan as a self-contained link — same drawer as opendocs' Share. */
export const ShareDialog: React.FC<ShareDialogProps> = ({ plan, annotations, title, onClose }) => {
  const [include, setInclude] = React.useState('all');
  const [url, setUrl] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    const filtered = include === 'plan' ? [] : include === 'resolved' ? annotations.filter(a => a.resolved) : annotations;
    setUrl('');
    encodeSharePayload({ version: 1, title, plan, annotations: filtered }).then(hash => { if (!cancelled) setUrl(BASE_URL + hash); });
    return () => { cancelled = true; };
  }, [include, plan, annotations, title]);

  return (
    <Drawer title="Share plan" onClose={onClose}>
      <p className="od-hint" style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>
        Anyone with the link can read this plan in their browser. The link carries the content itself — nothing is uploaded.
      </p>
      <div className="op-sect">What to include</div>
      <div className="op-people">
        {OPTIONS.map(o => (
          <label key={o.id} className="op-person" style={{ cursor: 'pointer' }}>
            <span className={`op-radio${include === o.id ? ' is-on' : ''}`} />
            <input type="radio" checked={include === o.id} onChange={() => setInclude(o.id)} style={{ display: 'none' }} />
            <div className="op-person-main">
              <div className="op-person-name">{o.label}</div>
              <div className="op-person-sub">{o.sub}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="op-sect">Plan link</div>
      <div className="op-linkbox">
        <Icon name="link" size={13} />
        <span className="op-linkbox-url">{url || 'generating…'}</span>
        <CopyButton text={url} label="Copy link" />
      </div>
      <div className="op-note-warn"><Icon name="warning" size={14} /><span>The link contains the full plan text. Anyone who has it can view it.</span></div>
    </Drawer>
  );
};
