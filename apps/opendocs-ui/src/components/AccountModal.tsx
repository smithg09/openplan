import React from 'react';
import { signIn, signInWithProvider, signOut, signUp, type AccountUser } from '../account';
import { localAuthor, setLocalAuthor } from '../adapt';
import { Button, Icon, Modal } from './ui';

/** Sign in, create an account, or manage the current one. Accounts are optional. */
export const AccountModal: React.FC<{ user: AccountUser | null; onClose: () => void; onChanged: () => void; onAuthorChange: (name: string) => void }> = ({ user, onClose, onChanged, onAuthorChange }) => {
  const [display, setDisplay] = React.useState(localAuthor());
  const saveName = () => { const n = display.trim() || 'You'; setLocalAuthor(n); onAuthorChange(n); };
  const [tab, setTab] = React.useState<'in' | 'up'>('in');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (tab === 'up') await signUp(name.trim() || email.split('@')[0], email.trim(), password);
      else await signIn(email.trim(), password);
      onChanged();
      onClose();
    } catch (ex) { setErr(ex instanceof Error ? ex.message : String(ex)); } finally { setBusy(false); }
  };

  if (user) {
    return (
      <Modal title="Account" onClose={onClose} width={420}
        foot={<><div style={{ flex: 1 }} /><Button kind="outline" size="md" onClick={async () => { await signOut().catch(() => {}); onChanged(); onClose(); }}>Sign out</Button></>}>
        <p style={{ margin: 0, lineHeight: 1.6 }}><b>{user.name}</b><br /><span style={{ color: 'var(--text-muted)' }}>{user.email}</span></p>
        <p className="od-hint">Documents you publish while signed in belong to this account and open on any device. Your comments show your name.</p>
      </Modal>
    );
  }
  return (
    <Modal title="Profile" onClose={onClose} width={420}>
      <div className="od-auth">
        <label className="od-label">Display name</label>
        <input className="od-input" value={display} onChange={(e) => setDisplay(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') { saveName(); (e.target as HTMLInputElement).blur(); } }} />
        <p className="od-hint">Shown on your comments. You don't need an account to use opendocs.</p>
      </div>
      <p className="od-hint" style={{ margin: '18px 0 10px' }}>Sign in to keep your published documents across devices.</p>
      <Button kind="outline" size="lg" disabled={busy} style={{ width: '100%', justifyContent: 'center' }} icon={<Icon name="github" size={15} />}
        onClick={async () => { setBusy(true); setErr(''); try { await signInWithProvider('github'); } catch (ex) { setErr(ex instanceof Error ? ex.message : String(ex)); setBusy(false); } }}>
        Continue with GitHub
      </Button>
      {err && <div className="od-err" style={{ marginTop: 8 }}>{err}</div>}
      <div className="od-auth-or"><span>or use email</span></div>
      <form onSubmit={(e) => void submit(e)} className="od-auth">
        {tab === 'up' && (<><label className="od-label">Name</label><input className="od-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></>)}
        <label className="od-label">Email</label>
        <input className="od-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="od-label">Password</label>
        <input className="od-input" type="password" required minLength={8} autoComplete={tab === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <div className="od-err">{err}</div>}
        <Button kind="primary" size="lg" disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} type="submit">{tab === 'in' ? 'Sign in' : 'Create account'}</Button>
        <p className="od-hint" style={{ textAlign: 'center' }}>
          {tab === 'in' ? 'New here? ' : 'Already have an account? '}
          <a href="#toggle" onClick={(e) => { e.preventDefault(); setErr(''); setTab(tab === 'in' ? 'up' : 'in'); }}>{tab === 'in' ? 'Create an account' : 'Sign in'}</a>
        </p>
      </form>
    </Modal>
  );
};
