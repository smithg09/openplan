import React from 'react';
import { Icon } from '../icons';

const items = ['Local-first: documents stay on your machine', 'Free and open source, MIT licensed', 'Share with capability links, no accounts', 'One Go binary per tool'];

export default function TrustStrip() {
  return (
    <div className="tstrip">
      <div className="tinner wrap">
        {items.map((t, i) => (
          <React.Fragment key={t}>
            {i > 0 && <span className="tsep" />}
            <div className="titem"><span style={{ color: 'var(--accent-fg)', display: 'inline-flex' }}><Icon name="check" size={14} weight={600} /></span><span>{t}</span></div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
