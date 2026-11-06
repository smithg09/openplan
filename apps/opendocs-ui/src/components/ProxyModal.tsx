import React from 'react';
import { api } from '../api';
import { DEFAULT_PROXY, WEB } from '../env';
import { Button, DismissButton, Modal } from './ui';

/** The proxy URL editor with its own Save button; used by the Proxy dialog and the Profile dialog. */
export const ProxyField: React.FC<{ mode: 'local' | 'proxy'; footer?: (s: { save: () => void; status: React.ReactNode }) => React.ReactNode }> = ({ mode, footer }) => {
  const [proxy, setProxy] = React.useState('');
  const [saved, setSaved] = React.useState('');
  const [err, setErr] = React.useState('');
  const editable = mode === 'local';

  React.useEffect(() => {
    if (editable) api.getSettings().then((s) => setProxy(s.proxy === DEFAULT_PROXY ? '' : s.proxy)).catch((e) => setErr(String(e.message ?? e)));
  }, [editable]);

  const save = async () => {
    setErr(''); setSaved('');
    try {
      const r = await api.setSettings(proxy.trim());
      setProxy(r.proxy === DEFAULT_PROXY ? '' : r.proxy);
      setSaved('Saved');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const status = <>{saved && <span className="od-ok-inline">{saved}</span>}{err && <span className="od-err-inline">{err}</span>}</>;
  const body = editable ? (
    <>
      <label className="od-label">Proxy URL</label>
      <input className="od-input" placeholder={WEB ? `${DEFAULT_PROXY} (default)` : 'https://docs.your-team.com — leave empty to stay local'} value={proxy} onChange={(e) => setProxy(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
      <p className="od-hint">Where <b>Share → Publish</b> uploads documents{WEB ? '; leave empty to use the hosted default' : ''}. Must be https (or http://localhost).{!WEB && <> <code>opendocs publish</code> uses the same setting.</>}</p>
    </>
  ) : (
    <p className="od-hint">You are viewing a shared document, so this page talks to its own proxy. Open the app home to choose a different one for publishing.</p>
  );
  return <>{body}{footer ? footer({ save: () => void save(), status }) : (editable && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <Button kind="outline" size="md" onClick={() => void save()}>Save proxy</Button>{status}
    </div>
  ))}</>;
};

/** Where Share → Publish uploads documents (the user's own proxy, or the hosted default on the web). */
export const ProxyModal: React.FC<{ mode: 'local' | 'proxy'; onClose: () => void }> = ({ mode, onClose }) => {
  const [submit, setSubmit] = React.useState<(() => void) | null>(null);
  return (
    <Modal title="Proxy" onClose={onClose} width={520} foot={
      <>
        <div style={{ flex: 1 }} />
        <DismissButton>Close</DismissButton>
        {mode === 'local' && <Button kind="primary" onClick={() => submit?.()}>Save</Button>}
      </>
    }>
      <div className="op-settings-section">
        <h3>Sharing proxy</h3>
        <ProxyField mode={mode} footer={({ save, status }) => { if (submit !== save) queueMicrotask(() => setSubmit(() => save)); return <div style={{ marginTop: 6 }}>{status}</div>; }} />
      </div>
    </Modal>
  );
};
