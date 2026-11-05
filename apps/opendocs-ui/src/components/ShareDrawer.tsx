import React from 'react';
import { api, type ApiShare, type Role } from '../api';
import { Button, CopyButton, Drawer, Icon } from './ui';

const ROLE_HELP: Record<Role, string> = {
  viewer: 'Can read the document and its comments.',
  commenter: 'Can also comment, reply, react and resolve.',
  editor: 'Can also publish versions, share, and delete any comment.',
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <select className="od-select" value={value} onChange={(e) => onChange(e.target.value as Role)} aria-label="Role">
      <option value="viewer">Viewer</option>
      <option value="commenter">Commenter</option>
      <option value="editor">Editor</option>
    </select>
  );
}

/** Proxy mode (editors): manage this document's capability links. */
function ProxyShare({ doc, origin }: { doc: string; origin: string }) {
  const [shares, setShares] = React.useState<ApiShare[]>([]);
  const [role, setRole] = React.useState<Role>('commenter');
  const [label, setLabel] = React.useState('');
  const [fresh, setFresh] = React.useState<{ link: string; role: Role } | null>(null);
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => api.listShares(doc).then((r) => setShares(r.shares ?? [])).catch((e) => setErr(errMsg(e))), [doc]);
  React.useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.mintShare(doc, role, label.trim());
      setFresh({ link: `${origin}/d/${encodeURIComponent(doc)}#t=${encodeURIComponent(r.token)}`, role });
      setLabel('');
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <label className="od-label">Create a link</label>
      <input className="od-input" placeholder="Label — e.g. “for Okonkwo’s team”" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} />
      <p className="od-hint">Anyone holding a link has exactly its role. Add a label so you remember who it is for.</p>
      <RoleSelect value={role} onChange={setRole} />
      <Button kind="primary" size="lg" disabled={busy} style={{ width: '100%', justifyContent: 'center' }} onClick={() => void create()}>Create link</Button>
      <p className="od-hint">{ROLE_HELP[role]}</p>

      {fresh && (
        <div className="od-fresh">
          <div className="od-fresh-top"><b>{fresh.role}</b> link — copy it now, it can’t be shown again</div>
          <div className="od-fresh-row"><code>{fresh.link}</code><CopyButton text={fresh.link} label="Copy" /></div>
        </div>
      )}
      {err && <div className="od-err">{err}</div>}

      <div className="od-sect">Links with access</div>
      <div className="od-people">
        {shares.length === 0 && <div className="od-empty-s">No links yet.</div>}
        {shares.map((s) => (
          <div className="od-person" key={s.id}>
            <div className="od-person-main">
              <div className="od-person-name">{s.label || <i>Unlabelled link</i>}</div>
              <div className="od-person-sub">Created {new Date(s.createdAt).toLocaleDateString()}</div>
            </div>
            <span className="od-person-role">{s.role}</span>
            <Button size="sm" kind="ghost" style={{ color: 'var(--danger)' }} onClick={async () => { await api.revokeShare(doc, s.id).catch((e) => setErr(errMsg(e))); await load(); }}>Revoke</Button>
          </div>
        ))}
      </div>
    </>
  );
}

/** Local mode: publish this document to a proxy, then copy links for each role. */
function LocalShare({ doc, onOpenSettings }: { doc: string; onOpenSettings: () => void }) {
  const [status, setStatus] = React.useState<{ published: boolean; proxy?: string; id?: string } | null>(null);
  const [proxy, setProxy] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [note, setNote] = React.useState('');

  const load = React.useCallback(async () => {
    const [st, set] = await Promise.all([api.remoteStatus(doc), api.getSettings()]);
    setStatus(st);
    setProxy(st.proxy || set.proxy || '');
  }, [doc]);
  React.useEffect(() => { void load().catch((e) => setErr(errMsg(e))); }, [load]);

  const publish = async () => {
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await api.publish(doc, proxy.trim() || undefined);
      setNote(r.new ? 'Published. Copy a link below to share it.' : 'Published the latest version to the same document.');
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  if (!status) return <div className="od-hint">{err || 'Loading…'}</div>;
  return (
    <>
      <p className="od-hint" style={{ marginTop: 0 }}>
        This document only exists on this machine. Publish it to an <b>opendocs-proxy</b> to let other people review it — you get links to send.
      </p>
      {!status.published ? (
        <>
          <label className="od-label">Proxy URL</label>
          <input className="od-input" placeholder="https://docs.your-team.com" value={proxy} onChange={(e) => setProxy(e.target.value)} />
          <p className="od-hint">
            No proxy yet? <a href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer">Self-host one</a> (a single binary). The URL is remembered in <a href="#settings" onClick={(e) => { e.preventDefault(); onOpenSettings(); }}>Settings</a>.
          </p>
          <Button kind="primary" size="lg" disabled={busy || !proxy.trim()} style={{ width: '100%', justifyContent: 'center' }} onClick={() => void publish()}>Publish and get links</Button>
        </>
      ) : (
        <>
          <div className="od-published"><span className="op-live-dot" style={{ background: 'var(--success)' }} /> Published to <code>{status.proxy}</code></div>
          <Button kind="outline" size="sm" disabled={busy} icon={<Icon name="refresh" size={13} />} onClick={() => void publish()}>Publish latest version</Button>
          <div className="od-sect">Links</div>
          <div className="od-people">
            {(['commenter', 'viewer', 'editor'] as Role[]).map((r) => (
              <div className="od-person" key={r}>
                <div className="od-person-main">
                  <div className="od-person-name" style={{ textTransform: 'capitalize' }}>{r}</div>
                  <div className="od-person-sub">{ROLE_HELP[r]}</div>
                </div>
                <CopyButton label="Copy link" getText={async () => (await api.remoteLink(doc, r)).link} />
              </div>
            ))}
          </div>
          <p className="od-hint">Each copy creates a fresh link you can revoke later from the proxy. The editor link gives full control — keep it private.</p>
        </>
      )}
      {note && <div className="od-ok">{note}</div>}
      {err && <div className="od-err">{err}</div>}
    </>
  );
}

export const ShareDrawer: React.FC<{ mode: 'local' | 'proxy'; doc: string; onClose: () => void; onOpenSettings: () => void }> = ({ mode, doc, onClose, onOpenSettings }) => (
  <Drawer title="Share document" onClose={onClose}>
    {mode === 'proxy' ? <ProxyShare doc={doc} origin={window.location.origin} /> : <LocalShare doc={doc} onOpenSettings={() => { onClose(); onOpenSettings(); }} />}
  </Drawer>
);
