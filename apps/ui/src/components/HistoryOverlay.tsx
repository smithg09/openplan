import React from 'react';
import { Button, Bracket, StatusPill, absTime } from './Primitives';
import { DiffPane } from '@openplan/diff-viewer';
import { useStore } from '../store';

interface HistoryOverlayProps {
  onClose: () => void;
  onRestore: (v: number) => void;
}

export const HistoryOverlay: React.FC<HistoryOverlayProps> = ({ onClose, onRestore }) => {
  const { versions, slug, plan } = useStore();
  const [active, setActive] = React.useState(versions[0]?.version ?? 1);
  const [diffMode, setDiffMode] = React.useState<'inline' | 'side'>('side');
  const [versionContents, setVersionContents] = React.useState<Record<number, string>>({});
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  // Fetch version content when selected
  React.useEffect(() => {
    if (versionContents[active] !== undefined) return;
    // Current version uses the live plan content
    const currentVersion = versions[0]?.version;
    if (active === currentVersion) {
      setVersionContents(prev => ({ ...prev, [active]: plan }));
      return;
    }
    setFetchError(null);
    fetch(`/api/version/${active}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        setVersionContents(prev => ({ ...prev, [active]: d.content ?? '' }));
      })
      .catch(err => {
        setFetchError(`Failed to load v${active}: ${err.message}`);
        setVersionContents(prev => ({ ...prev, [active]: '' }));
      });
  }, [active, versions, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also fetch the previous version for diffing
  const prevVersion = Math.max(1, active - 1);
  React.useEffect(() => {
    if (prevVersion === active) return;
    if (versionContents[prevVersion] !== undefined) return;
    const currentVersion = versions[0]?.version;
    if (prevVersion === currentVersion) {
      setVersionContents(prev => ({ ...prev, [prevVersion]: plan }));
      return;
    }
    fetch(`/api/version/${prevVersion}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        setVersionContents(prev => ({ ...prev, [prevVersion]: d.content ?? '' }));
      })
      .catch(() => {
        setVersionContents(prev => ({ ...prev, [prevVersion]: '' }));
      });
  }, [prevVersion, versions, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const oldContent = versionContents[prevVersion] ?? '';
  const newContent = versionContents[active] ?? '';

  return (
    <div className="op-overlay" onClick={onClose}>
      <div
        className="op-modal"
        style={{ width: 'min(1100px, 92vw)', height: 'min(700px, 88vh)', display: 'flex', flexDirection: 'column', padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="op-modal-head">
          <span className="op-modal-title">// version history · {slug}</span>
          <Button kind="ghost" size="sm" onClick={onClose}>esc</Button>
        </div>
        <div className="op-diff" style={{ flex: 1, minHeight: 0 }}>
          <div className="op-diff-timeline">
            {versions.length === 0 ? (
              <div style={{ padding: 20, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>
                // no versions stored yet
              </div>
            ) : (
              versions.map(v => (
                <div
                  key={v.version}
                  className={`op-diff-version ${active === v.version ? 'is-active' : ''}`}
                  onClick={() => setActive(v.version)}
                >
                  <div className="op-diff-version-head">
                    <span>v{v.version}</span>
                    {v.label && <Bracket>{v.label}</Bracket>}
                    <div className="op-grow" />
                    <StatusPill status={v.status} />
                  </div>
                  <div className="op-diff-version-time">{absTime(v.timestamp)}</div>
                  <div className="op-diff-version-meta">
                    {v.source} · {v.annotations} annotation{v.annotations !== 1 ? 's' : ''}
                  </div>
                  <div className="op-diff-version-actions">
                    {active !== v.version && (
                      <Button kind="ghost" size="sm" onClick={e => { e.stopPropagation(); onRestore(v.version); }}>
                        restore
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {fetchError ? (
            <div className="op-diff-pane" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{fetchError}</div>
            </div>
          ) : (
            <DiffPane
              oldContent={oldContent}
              newContent={newContent}
              activeVersion={active}
              mode={diffMode}
              onModeChange={setDiffMode}
            />
          )}
        </div>
      </div>
    </div>
  );
};
