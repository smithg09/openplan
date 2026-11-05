import React from 'react';
import { api } from '../api';
import { setLocalAuthor, localAuthor } from '../adapt';
import { Modal } from './Modal';

export type Theme = 'dark' | 'light';

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '');
  try { localStorage.setItem('opendocs:theme', t); } catch { /* ignore */ }
}

export function savedTheme(): Theme {
  try { return localStorage.getItem('opendocs:theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

export function SettingsModal({ mode, onClose, onAuthorChange }: {
  mode: 'local' | 'proxy';
  onClose: () => void;
  onAuthorChange: (name: string) => void;
}) {
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
      setLocalAuthor(n);
      onAuthorChange(n);
      applyTheme(theme);
      if (mode === 'local') setProxy((await api.setSettings(proxy.trim())).proxy);
      setSaved('Saved.');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <label className="od-label">Your name</label>
      <input className="od-input" value={name} onChange={(e) => setName(e.target.value)} />
      <p className="od-hint">Shown on the comments you write from this browser.</p>

      <label className="od-label">Theme</label>
      <div className="od-seg" role="radiogroup">
        {(['dark', 'light'] as Theme[]).map((t) => (
          <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? 'on' : ''} onClick={() => { setTheme(t); applyTheme(t); }}>{t}</button>
        ))}
      </div>

      {mode === 'local' && (
        <>
          <label className="od-label">Sharing proxy</label>
          <input className="od-input" placeholder="https://docs.your-team.com (leave empty for local only)" value={proxy} onChange={(e) => setProxy(e.target.value)} />
          <p className="od-hint">
            Where <b>Share → Publish</b> uploads documents. Must be <code>https</code> (or <code>http://localhost</code>). The CLI’s <code>opendocs publish</code> uses the same setting.
          </p>
        </>
      )}

      <div className="od-actions">
        {saved && <span className="od-ok-inline">{saved}</span>}
        {err && <span className="od-err-inline">{err}</span>}
        <button className="od-btn od-btn-ghost" onClick={onClose}>Close</button>
        <button className="od-btn od-btn-primary" onClick={() => void save()}>Save</button>
      </div>
    </Modal>
  );
}
