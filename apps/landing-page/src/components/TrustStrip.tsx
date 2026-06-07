import React from 'react';

// Small inline SVG check for trust items
const TrustCheck = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-fg)', flexShrink: 0 }}>
    <path d="M3 8.5l3.5 3.5L13 5.5" />
  </svg>
);

const items = [
  'Runs locally — plans never leave your machine',
  'Free & open source — MIT License',
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
