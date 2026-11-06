import React from 'react';
import { api } from '../api';
import { DEFAULT_PROXY, WEB } from '../env';
import { Button, DismissButton, Modal } from './ui';

/** Where Share → Publish uploads documents (the user's own proxy, or the hosted default on the web). */
export const ProxyModal: React.FC<{ mode: 'local' | 'proxy'; onClose: () => void }> = ({ mode, onClose }) => {
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

  return (
    <Modal title="Proxy" onClose={onClose} width={520} foot={
      <>
        {saved && <span className="od-ok-inline">{saved}</span>}
        {err && <span className="od-err-inline">{err}</span>}
        <div style={{ flex: 1 }} />
        <DismissButton>Close</DismissButton>
        {editable && <Button kind="primary" onClick={() => void save()}>Save</Button>}
      </>
    }>
      <div className="op-settings-section">
        <h3>Sharing proxy</h3>
        {editable ? (
          <>
            <label className="od-label">Proxy URL</label>
            <input className="od-input" placeholder={WEB ? `${DEFAULT_PROXY} (default)` : 'https://docs.your-team.com — leave empty to stay local'} value={proxy} onChange={(e) => setProxy(e.target.value)} />
            <p className="od-hint">Where <b>Share → Publish</b> uploads documents{WEB ? '; leave empty to use the hosted default' : ''}. Must be https (or http://localhost).{!WEB && <> <code>opendocs publish</code> uses the same setting.</>}</p>
          </>
        ) : (
          <p className="od-hint">You are viewing a shared document, so this page talks to its own proxy. Open the app home to choose a different one for publishing.</p>
        )}
      </div>
    </Modal>
  );
};
