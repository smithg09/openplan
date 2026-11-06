import React from 'react';
import { Icon } from './icons';

export type RailFilter = 'all' | 'open' | 'resolved';

/** Header of the right-hand comments panel — identical in openplan and opendocs. */
export const RailHeader: React.FC<{
  count: number;
  filter?: RailFilter;
  counts?: { all: number; open: number; resolved: number };
  onFilter?: (f: RailFilter) => void;
  onCopyMD?: () => void;
  onClose: () => void;
}> = ({ count, filter, counts, onFilter, onCopyMD, onClose }) => (
  <div className="op-rail-head-wrap">
    <div className="op-rail-head">
      <span className="op-rail-title">Comments</span>
      <span className="op-rail-count">{count}</span>
      <div style={{ flex: 1 }} />
      {onCopyMD && <button className="op-btn op-btn-ghost op-btn-sm" onClick={onCopyMD} title="Copy as Markdown"><span>Copy MD</span></button>}
      <button className="op-btn op-btn-ghost op-btn-sm op-btn-icon-only" onClick={onClose} title="Close comments" aria-label="Close comments"><span className="op-btn-icon"><Icon name="close" size={15} /></span></button>
    </div>
    {filter && counts && onFilter && (
      <div className="op-rail-tabs" role="tablist">
        {(['all', 'open', 'resolved'] as RailFilter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={`op-rail-tab${filter === f ? ' is-active' : ''}`} onClick={() => onFilter(f)}>
            {f}<span>{counts[f]}</span>
          </button>
        ))}
      </div>
    )}
  </div>
);
