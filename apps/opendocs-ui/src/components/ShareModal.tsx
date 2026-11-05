import React from 'react';
import { api, type ApiShare, type Role } from '../api';
import { CopyButton, Modal } from './Modal';

const ROLE_HELP: Record<Role, string> = {
  viewer: 'Can read the document and comments.',
  commenter: 'Can also comment, reply, react and resolve.',
  editor: 'Can also publish versions, share and delete any comment.',
};

function errMsg(e: unknown) { return e instanceof Error ? e.message : String(e); }

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
      <p className="od-hint">Anyone with a link has exactly that role. Links can’t be recovered later — copy it when you create it — but you can revoke any of them.</p>
      <div className="od-row">
        <select className="od-select" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">
          <option value="viewer">Viewer</option>
          <option value="commenter">Commenter</option>
          <option value="editor">Editor</option>
        </select>
        <input className="od-input" placeholder="Label (e.g. “for Priya”)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="od-btn od-btn-primary" disabled={busy} onClick={() => void create()}>Create link</button>
      </div>
      <p className="od-hint">{ROLE_HELP[role]}</p>
      {fresh && (
        <div className="od-linkbox">
          <div className="od-linkbox-top"><b>{fresh.role}</b> link — copy it now</div>
          <div className="od-linkrow"><code>{fresh.link}</code><CopyButton text={fresh.link} /></div>
        </div>
      )}
      {err && <div className="od-err">{err}</div>}
      <h3 className="od-sub">Active links</h3>
      <div className="od-list">
        {shares.length === 0 && <div className="od-empty-s">No links yet.</div>}
        {shares.map((s) => (
          <div className="od-listrow" key={s.id}>
            <span className="od-pill">{s.role}</span>
            <span className="od-grow">{s.label || <i>no label</i>}</span>
            <span className="od-faint">{new Date(s.createdAt).toLocaleDateString()}</span>
            <button className="od-btn od-btn-ghost od-danger" onClick={async () => { await api.revokeShare(doc, s.id).catch((e) => setErr(errMsg(e))); await load(); }}>Revoke</button>
          </div>
        ))}
      </div>
    </>
  );
}

/** Local mode: publish this document to a proxy and hand out links. */
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
      setNote(r.new ? 'Published. Create a link below to share it.' : 'Published the latest version to the same document.');
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  if (!status) return <div className="od-hint">{err || 'Loading…'}</div>;

  return (
    <>
      <p className="od-hint">
        This document lives only on this machine. To let others review it, publish it to an <b>opendocs-proxy</b> — you’ll get links you can send.
      </p>
      {!status.published ? (
        <>
          <label className="od-label">Proxy URL</label>
          <div className="od-row">
            <input className="od-input" placeholder="https://docs.your-team.com" value={proxy} onChange={(e) => setProxy(e.target.value)} />
            <button className="od-btn od-btn-primary" disabled={busy || !proxy.trim()} onClick={() => void publish()}>Publish</button>
          </div>
          <p className="od-hint">Don’t have one? <a href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer">Self-host it</a> (one binary) and paste its URL. Saved under <a href="#settings" onClick={(e) => { e.preventDefault(); onOpenSettings(); }}>Settings</a>.</p>
        </>
      ) : (
        <>
          <div className="od-published">
            <span className="od-dot" /> Published to <code>{status.proxy}</code>
            <button className="od-btn od-btn-ghost" disabled={busy} onClick={() => void publish()}>Publish latest version</button>
          </div>
          <h3 className="od-sub">Share links</h3>
          <p className="od-hint">Each click creates a fresh link you can revoke later from the proxy.</p>
          <div className="od-list">
            {(['commenter', 'viewer', 'editor'] as Role[]).map((r) => (
              <div className="od-listrow" key={r}>
                <span className="od-pill">{r}</span>
                <span className="od-grow od-faint">{ROLE_HELP[r]}</span>
                <CopyButton label="Copy link" getText={async () => (await api.remoteLink(doc, r)).link} />
              </div>
            ))}
          </div>
          <p className="od-hint">The <b>editor</b> link grants full control — keep it private.</p>
        </>
      )}
      {note && <div className="od-ok">{note}</div>}
      {err && <div className="od-err">{err}</div>}
    </>
  );
}

export function ShareModal({ mode, doc, onClose, onOpenSettings }: {
  mode: 'local' | 'proxy';
  doc: string;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <Modal title="Share" onClose={onClose} width={560}>
      {mode === 'proxy' ? <ProxyShare doc={doc} origin={window.location.origin} /> : <LocalShare doc={doc} onOpenSettings={() => { onClose(); onOpenSettings(); }} />}
    </Modal>
  );
}
