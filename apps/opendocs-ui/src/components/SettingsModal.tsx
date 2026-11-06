import React from 'react';
import { api } from '../api';
import { localAuthor, setLocalAuthor } from '../adapt';
import { applyTheme, savedTheme, type Theme } from '../lib/theme';
import { Button, DismissButton, Icon, Modal } from './ui';

export const SettingsModal: React.FC<{
  mode: 'local' | 'proxy';
  onClose: () => void;
  onAuthorChange: (name: string) => void;
  onThemeChange: (t: Theme) => void;
}> = ({ mode, onClose, onAuthorChange, onThemeChange }) => {
  const [name, setName] = React.useState(localAuthor());
  const [theme, setTheme] = React.useState<Theme>(savedTheme());
  const [proxy, setProxy] = React.useState('');
  const [saved, setSaved] = React.useState('');
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    if (mode === 'local') api.getSettings().then((s) => setProxy(s.proxy)).catch((e) => setErr(String(e.message ?? e)));
  }, [mode]);

  const save = async () => {
    setErr(''); setSaved('');
    try {
      const n = name.trim() || 'You';
      setLocalAuthor(n); onAuthorChange(n);
      onThemeChange(theme);
      if (mode === 'local') setProxy((await api.setSettings(proxy.trim())).proxy);
      setSaved('Saved');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Modal title="Settings" onClose={onClose} width={520} foot={
      <>
        {saved && <span className="od-ok-inline">{saved}</span>}
        {err && <span className="od-err-inline">{err}</span>}
        <div style={{ flex: 1 }} />
        <DismissButton>Close</DismissButton>
        <Button kind="primary" onClick={() => void save()}>Save</Button>
      </>
    }>
      <div className="op-settings-section">
        <h3>Profile</h3>
        <label className="od-label">Your name</label>
        <input className="od-input" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="od-hint">Shown on the comments you write from this browser.</p>
      </div>
      <div className="op-settings-section">
        <h3>Appearance</h3>
        <div className="op-menu-theme-row" style={{ padding: 0 }}>
          {([['dark', 'Dark', 'dark_mode'], ['light', 'Light', 'light_mode'], ['system', 'Auto', 'brightness_auto']] as [Theme, string, string][]).map(([v, label, icon]) => (
            <button key={v} className={`op-menu-theme-btn ${theme === v ? 'is-active' : ''}`} onClick={() => { setTheme(v); applyTheme(v); onThemeChange(v); }}><Icon name={icon} size={15} /><span>{label}</span></button>
          ))}
        </div>
        <p className="od-hint">Documents follow this too: the app tells each page whether it is light or dark.</p>
      </div>
      {mode === 'local' && (
        <div className="op-settings-section">
          <h3>Sharing</h3>
          <label className="od-label">Proxy URL</label>
          <input className="od-input" placeholder="https://docs.your-team.com — leave empty to stay local" value={proxy} onChange={(e) => setProxy(e.target.value)} />
          <p className="od-hint">Where <b>Share → Publish</b> uploads documents. Must be https (or http://localhost). <code>opendocs publish</code> uses the same setting.</p>
        </div>
      )}
    </Modal>
  );
};
