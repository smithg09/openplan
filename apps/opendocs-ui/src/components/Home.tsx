import React from 'react';
import { TopBar as SharedTopBar, Icon, MenuItem, Button, Modal } from '@openplan/chrome';
import { EXAMPLES, type Example } from '../examples';
import { accountDocs, api, type SearchHit } from '../api';
import { DEFAULT_PROXY } from '../env';
import type { AccountUser } from '../account';
import { htmlTitle } from '../lib/htmlmeta';
import { USER_HEADER, userToken } from '../account';
import type { LocalFolder } from '../lib/localfs';
import { forgetShared, sharedHref, type SharedDoc } from '../lib/recent';
import type { Theme } from '../lib/theme';

async function authHeaders(): Promise<Record<string, string>> {
  const t = await userToken();
  return t ? { [USER_HEADER]: t } : {};
}

interface Card { slug: string; title: string; versions: number; open: number; updatedAt: string }

const ago = (iso: string): string => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
};

interface Props {
  docs: string[];
  shared: SharedDoc[];
  fsSupported: boolean;
  author: string;
  theme: Theme;
  onOpen: (slug: string) => void;
  onOpenExample: (e: Example) => void;
  onUpload: (file: File) => void;
  onDelete: (slug: string) => Promise<void>;
  onPickFolder: () => void;
  folder: LocalFolder | null;
  importing: string | null;
  onOpenLocalFile: (path: string) => void;
  onCloseFolder: () => void;
  onSetTheme: (t: Theme) => void;
  onSettings: () => void;
  onProxy: () => void;
  onShortcuts: () => void;
  onForgot: () => void;
  account?: { user: AccountUser | null; onOpen: () => void };
}

/** Documents home: everything on this device (and links opened here), searchable, one click to continue. */
export const Home: React.FC<Props> = (p) => {
  const [cards, setCards] = React.useState<Card[] | null>(null);
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[] | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [view, setView] = React.useState<'grid' | 'list'>(() => (localStorage.getItem('opendocs:home-view') === 'list' ? 'list' : 'grid'));
  const [examplesOpen, setExamplesOpen] = React.useState(() => localStorage.getItem('opendocs:examples') !== 'closed');
  const [pending, setPending] = React.useState<Card | null>(null);
  const [busy, setBusy] = React.useState(false);
  const setViewSaved = (v: 'grid' | 'list') => { setView(v); try { localStorage.setItem('opendocs:home-view', v); } catch { /* ignore */ } };
  const toggleExamples = () => setExamplesOpen((o) => { try { localStorage.setItem('opendocs:examples', o ? 'closed' : 'open'); } catch { /* ignore */ } return !o; });
  const confirmDelete = async () => {
    if (!pending) return;
    setBusy(true);
    try { await p.onDelete(pending.slug); setCards((cs) => (cs ?? []).filter((c) => c.slug !== pending.slug)); setPending(null); } finally { setBusy(false); }
  };
  // Documents this account published (on the hosted proxy), only when signed in.
  const [mine, setMine] = React.useState<{ id: string; title: string; createdAt: string }[] | null>(null);
  const userId = p.account?.user?.id;
  React.useEffect(() => {
    if (!userId) { setMine(null); return; }
    let live = true;
    (async () => {
      try {
        const list = await accountDocs(DEFAULT_PROXY);
        const out = await Promise.all(list.map(async (d) => {
          try {
            const vs = (await (await fetch(`${DEFAULT_PROXY}/api/docs/${d.id}/versions`, { headers: await authHeaders() })).json()) as { versions: { id: string }[] | null };
            const head = vs.versions?.[vs.versions.length - 1];
            const html = head ? await (await fetch(`${DEFAULT_PROXY}/api/docs/${d.id}/versions/${head.id}/raw`, { headers: await authHeaders() })).text() : '';
            return { id: d.id, title: html ? htmlTitle(html, 'Untitled') : 'Untitled', createdAt: d.createdAt };
          } catch { return { id: d.id, title: 'Untitled', createdAt: d.createdAt }; }
        }));
        if (live) setMine(out);
      } catch { if (live) setMine([]); }
    })();
    return () => { live = false; };
  }, [userId]);

  const first = p.author.trim().split(/\s+/)[0] || 'there';

  React.useEffect(() => {
    let live = true;
    (async () => {
      const out: Card[] = [];
      for (const slug of p.docs) {
        try {
          const { versions } = await api.listVersions(slug);
          const vs = versions ?? [];
          const head = vs[vs.length - 1];
          if (!head) continue;
          const [html, cm] = await Promise.all([api.rawVersion(slug, head.id), api.listComments(slug)]);
          const open = (cm.comments ?? []).filter((c) => !c.rootCommentId && c.status !== 'resolved').length;
          out.push({ slug, title: htmlTitle(html, slug), versions: vs.length, open, updatedAt: head.createdAt });
        } catch { /* skip documents that fail to load */ }
      }
      if (live) setCards(out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    })();
    return () => { live = false; };
  }, [p.docs]);

  React.useEffect(() => {
    const query = q.trim();
    if (!query) { setHits(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      api.search(query).then((r) => live && setHits(r.results ?? [])).catch(() => live && setHits([]));
    }, 160);
    return () => { live = false; window.clearTimeout(t); };
  }, [q]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchRef.current) { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const titleOf = (slug: string) => cards?.find((c) => c.slug === slug)?.title ?? slug;
  const empty = cards !== null && cards.length === 0 && p.shared.length === 0;

  const docCard = (c: Card) => (
    <div key={c.slug} className={view === 'grid' ? 'od-home-card' : 'od-home-row od-home-docrow'} role="button" tabIndex={0}
      onClick={() => p.onOpen(c.slug)} onKeyDown={(e) => { if (e.key === 'Enter') p.onOpen(c.slug); }}>
      <span className="od-home-ico"><Icon name="description" size={18} /></span>
      <span className="od-home-card-main">
        <b>{c.title}</b>
        <span>v{c.versions} · {c.open ? `${c.open} open comment${c.open === 1 ? '' : 's'}` : 'no open comments'} · {ago(c.updatedAt)}</span>
      </span>
      <button className="od-home-del" title="Delete document" aria-label={`Delete ${c.title}`} onClick={(e) => { e.stopPropagation(); setPending(c); }}><Icon name="delete" size={15} /></button>
    </div>
  );

  return (
    <div className="op-app od-home-app">
      <div className="od-home-bg" aria-hidden="true"><i /><i /><i /></div>
      <SharedTopBar
        brand="opendocs" brandHref="https://opendocs.smithgajjar.dev" title="" actions={[]}
        menu={(close) => (
          <>
            <div className="op-menu-head">// theme</div>
            <div className="op-menu-theme-row">
              {([['dark', 'Dark', 'dark_mode'], ['light', 'Light', 'light_mode'], ['system', 'Auto', 'brightness_auto']] as [Theme, string, string][]).map(([v, label, icon]) => (
                <button key={v} className={`op-menu-theme-btn ${p.theme === v ? 'is-active' : ''}`} onClick={() => p.onSetTheme(v)}><Icon name={icon} size={15} /><span>{label}</span></button>
              ))}
            </div>
            <div className="op-menu-divider" />
            <MenuItem icon={<Icon name="keyboard" size={15} />} label="Keyboard shortcuts" hint="?" onClick={() => { close(); p.onShortcuts(); }} />
            {p.account && <MenuItem icon={<Icon name="person" size={15} />} label={p.account.user ? 'Account' : 'Sign in'} hint={p.account.user?.email} onClick={() => { close(); p.account!.onOpen(); }} />}
            <MenuItem icon={<Icon name="link" size={15} />} label="Proxy" onClick={() => { close(); p.onProxy(); }} />
            <MenuItem icon={<Icon name="settings" size={15} />} label="Settings" onClick={() => { close(); p.onSettings(); }} />
          </>
        )}
        avatar={{ name: p.author, onClick: p.account ? p.account.onOpen : p.onSettings, ...(p.account ? { badgeIcon: p.account.user ? undefined : 'login', title: p.account.user ? `${p.account.user.name} — account` : 'Profile and sign in' } : {}) }}
      />
      <input ref={fileRef} type="file" accept=".html,.htm,text/html" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onUpload(f); e.target.value = ''; }} />
      <div className="od-home">
        <div className="od-home-inner">
          <div className="od-home-hero">
            <p className="od-home-hi">Hi, {first}</p>
            <h1 className="od-home-title">What did your agents publish?</h1>
            <label className="od-home-search">
              <Icon name="search" size={16} />
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every word, even the footnotes…" aria-label="Search documents" />
              <kbd>/</kbd>
            </label>
          </div>

          <div className="od-home-bar">
            <h2>Documents</h2>
            <div className="od-home-tools">
              <div className="od-home-seg" role="group" aria-label="View">
                <button className={view === 'grid' ? 'is-on' : ''} title="Card view" aria-label="Card view" onClick={() => setViewSaved('grid')}><Icon name="space_dashboard" size={15} /></button>
                <button className={view === 'list' ? 'is-on' : ''} title="List view" aria-label="List view" onClick={() => setViewSaved('list')}><Icon name="format_list_bulleted" size={15} /></button>
              </div>
              <Button kind="outline" size="md" icon={<Icon name="upload" size={14} />} onClick={() => fileRef.current?.click()}>Upload HTML</Button>
              {p.fsSupported && <Button kind="outline" size="md" icon={<Icon name="folder" size={14} />} onClick={p.onPickFolder}>Open folder</Button>}
            </div>
          </div>

          {hits !== null ? (
            <section className="od-home-sec">
              <h3 className="od-home-h3">{hits.length} result{hits.length === 1 ? '' : 's'}</h3>
              <div className="od-home-list">
                {hits.map((h) => (
                  <button key={h.doc} className="od-home-row" onClick={() => p.onOpen(h.doc)}>
                    <span className="od-home-ico"><Icon name="description" size={16} /></span>
                    <span className="od-home-row-main"><b>{h.title || titleOf(h.doc)}</b><span>{h.snippet}</span></span>
                  </button>
                ))}
                {hits.length === 0 && <div className="od-home-none">Nothing matches “{q.trim()}”. Every word must appear, quotes match a phrase, and -word excludes.</div>}
              </div>
            </section>
          ) : (
            <>
              {cards === null && <div className="od-home-grid" aria-hidden="true"><i /><i /><i /></div>}
              {cards !== null && cards.length === 0 && (
                <div className="od-home-empty">
                  <Icon name="description" size={26} />
                  <b>No documents yet</b>
                  <span>Upload an HTML file, open a folder of them, or start from an example below.</span>
                </div>
              )}
              {cards !== null && cards.length > 0 && (view === 'grid' ? <div className="od-home-grid">{cards.map(docCard)}</div> : <div className="od-home-list">{cards.map(docCard)}</div>)}

              {mine && mine.length > 0 && (
                <section className="od-home-sec">
                  <h3 className="od-home-h3">Published by you <span>{mine.length}</span></h3>
                  <div className="od-home-list">
                    {mine.map((d) => (
                      <div key={d.id} className="od-home-row od-home-row-link">
                        <a href={`${import.meta.env.BASE_URL}d/${encodeURIComponent(d.id)}?proxy=${encodeURIComponent(DEFAULT_PROXY)}`}>
                          <span className="od-home-ico"><Icon name="link" size={16} /></span>
                          <span className="od-home-row-main"><b>{d.title}</b><span>On the hosted proxy · published {ago(d.createdAt)}</span></span>
                        </a>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {p.folder && (
                <section className="od-home-sec">
                  <h3 className="od-home-h3">
                    <Icon name="folder" size={14} /> {p.folder.name} <span>{p.folder.files.length} HTML file{p.folder.files.length === 1 ? '' : 's'}</span>
                    <button className="op-btn op-btn-ghost op-btn-sm" style={{ marginLeft: 'auto' }} onClick={p.onCloseFolder}>Close folder</button>
                  </h3>
                  <div className="od-home-list">
                    {p.folder.files.map((f) => (
                      <button key={f.path} className="od-home-row" disabled={p.importing === f.path} onClick={() => p.onOpenLocalFile(f.path)}>
                        <span className="od-home-ico"><Icon name="description" size={16} /></span>
                        <span className="od-home-row-main"><b>{f.path}</b><span>{p.importing === f.path ? 'Opening…' : 'Click to import and review'}</span></span>
                      </button>
                    ))}
                    {p.folder.files.length === 0 && <div className="od-home-none">No HTML files in this folder.</div>}
                  </div>
                </section>
              )}

              {p.shared.length > 0 && (
                <section className="od-home-sec">
                  <h3 className="od-home-h3">Opened from links <span>{p.shared.length}</span></h3>
                  <div className="od-home-list">
                    {p.shared.map((s) => (
                      <div key={`${s.proxy}/${s.id}`} className="od-home-row od-home-row-link">
                        <a href={sharedHref(s)}>
                          <span className="od-home-ico"><Icon name="link" size={16} /></span>
                          <span className="od-home-row-main"><b>{s.title || 'Shared document'}</b><span>{s.role} · opened {ago(new Date(s.at).toISOString())}</span></span>
                        </a>
                        <button className="op-btn op-btn-ghost op-btn-sm" title="Forget this link" onClick={() => { forgetShared(s.id, s.proxy); p.onForgot(); }}>Forget</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="od-home-sec">
                <button className="od-home-h3 od-home-collapse" aria-expanded={examplesOpen} onClick={toggleExamples}>
                  <span className={`od-home-chev${examplesOpen ? ' is-open' : ''}`}><Icon name="expand_more" size={14} /></span>Examples <span>{EXAMPLES.length}</span>
                </button>
                {examplesOpen && (
                  <div className="od-home-examples">
                    <p className="od-home-note">See what an agent can publish. Opening one adds a copy to your documents.</p>
                    <div className="od-home-exgrid">
                      {EXAMPLES.map((e) => (
                        <button key={e.slug} className="od-home-ex" onClick={() => p.onOpenExample(e)}>
                          <span className="od-home-ico"><Icon name="description" size={16} /></span>
                          <span className="od-home-card-main"><b>{e.title}</b><span>{e.kind}</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      {pending && (
        <Modal title="Delete document?" onClose={() => setPending(null)} width={420}
          foot={<><Button kind="ghost" size="md" onClick={() => setPending(null)}>Cancel</Button><Button kind="primary" size="md" disabled={busy} style={{ background: 'var(--danger)' }} onClick={() => void confirmDelete()}>Delete</Button></>}>
          <p style={{ margin: 0, lineHeight: 1.6 }}><b>{pending.title}</b> and all {pending.versions} version{pending.versions === 1 ? '' : 's'} and its comments will be removed from this device. This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
};
