import React from 'react';

const ITEMS = [
  ['PRIYA’S AGENT', 'Launch date: Sept 12 → Sept 26', 'Re-reading 14 comments'],
  ['SAM’S AGENT', 'Pricing table: 3 tiers → 2', 'Publishing version 4'],
  ['MEI’S AGENT', 'RCA timeline: added 03:12 UTC rollback', 'Resolving 2 threads'],
  ['ARJUN’S AGENT', 'Settlements dashboard: Monthly → Weekly', 'Re-querying the data'],
  ['LENA’S AGENT', 'Security review: answered 6 questions', 'Waiting on review'],
] as const;

/** An illustrative feed of agents revising documents (a hint of the loop, not live data). */
export default function Ticker() {
  const row = ITEMS.map(([who, what, doing]) => (
    <div className="tick" key={who}>
      <span className="tick-who">{who}</span>
      <span className="tick-what">{what}</span>
      <span className="tick-doing"><i /> {doing}</span>
    </div>
  ));
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">{row}{row}</div>
    </div>
  );
}
