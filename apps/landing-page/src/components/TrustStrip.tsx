import React from 'react';

import { Icon } from '../icons';

// Material Symbols check for trust items
const TrustCheck = () => (
  <span style={{ color: 'var(--accent-fg)', flexShrink: 0, display: 'inline-flex' }}>
    <Icon name="check" size={14} weight={600} />
  </span>
);

const items = [
  'Runs locally, plans never leave your machine',
  'Free & open source, MIT licensed',
  'One binary, zero dependencies',
];

export default function TrustStrip() {
  return (
    <div className="tstrip">
      <div className="tinner wrap">
        {items.map((t, i) => (
          <React.Fragment key={t}>
            {i > 0 && <span className="tsep" />}
            <div className="titem">
              <TrustCheck />
              <span>{t}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
