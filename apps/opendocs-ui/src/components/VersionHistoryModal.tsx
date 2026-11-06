import React from 'react';
import type { ApiVersion } from '../api';
import { Button, Icon, Modal, useDismiss } from './ui';

function when(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Version history in the style of SlashDocs': every revision is immutable, open
 * any one to see exactly what reviewers saw, restore an old one as the new head.
 */
type Props = {
  versions: ApiVersion[];
  currentId: string;
  canRestore: boolean;
  onOpen: (id: string) => void;
  onRestore: (id: string) => Promise<void>;
  onClose: () => void;
};

export const VersionHistoryModal: React.FC<Props> = (p) => (
  <Modal title="Version history" onClose={p.onClose} width={620}><Body {...p} /></Modal>
);

const Body: React.FC<Props> = ({ versions, currentId, canRestore, onOpen, onRestore }) => {
  const onClose = useDismiss();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState('');
  const latest = versions[versions.length - 1]?.id;
  const rows = versions.map((v, i) => ({ v, n: i + 1 })).reverse();

  return (
    <>
      <p className="od-hint" style={{ marginTop: 0 }}>
        Immutable revisions of this document. Open any version to inspect the exact HTML your reviewers saw; comments stay attached to the version they were made on.
      </p>
      <div className="od-versions">
        {rows.map(({ v, n }) => {
          const viewing = v.id === currentId;
          return (
            <div key={v.id} className={`od-ver ${viewing ? 'is-viewing' : ''}`}>
              <div className="od-ver-n">{n}</div>
              <div className="od-ver-main">
                <div className="od-ver-top">
                  <b>Version {n}</b>
                  {viewing && <span className="od-chip od-chip-accent"><Icon name="check" size={11} /> Viewing</span>}
                  {v.id === latest && <span className="od-chip">Latest</span>}
                </div>
                <div className="od-ver-sum">{v.summary || v.label || (n === 1 ? 'Initial version' : 'No summary')}</div>
                <div className="od-ver-meta">{when(v.createdAt)} <span className="op-mono">{v.id}</span></div>
              </div>
              <div className="od-ver-actions">
                {!viewing && <Button size="sm" kind="outline" onClick={() => { onOpen(v.id); onClose(); }}>Open</Button>}
                {canRestore && v.id !== latest && (
                  <Button size="sm" kind="ghost" disabled={busy === v.id} icon={<Icon name="undo" size={12} />} onClick={async () => {
                    setBusy(v.id); setErr('');
                    try { await onRestore(v.id); onClose(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
                  }}>Restore</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {err && <div className="od-err" style={{ marginTop: 10 }}>{err}</div>}
    </>
  );
};
