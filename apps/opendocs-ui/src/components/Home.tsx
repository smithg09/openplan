import React from 'react';
import { TopBar as SharedTopBar, Icon, MenuItem, Button } from '@openplan/chrome';
import { api, type SearchHit } from '../api';
import { htmlTitle } from '../lib/htmlmeta';
import { forgetShared, sharedHref, type SharedDoc } from '../lib/recent';
import type { Theme } from '../lib/theme';

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
  onOpenSample: () => void;
  onPickFolder: () => void;
  onSetTheme: (t: Theme) => void;
  onSettings: () => void;
  onShortcuts: () => void;
  onForgot: () => void;
}

/** Documents home: everything on this device (and links opened here), searchable, one click to continue. */
export const Home: React.FC<Props> = (p) => {
  const [cards, setCards] = React.useState<Card[] | null>(null);
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[] | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

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

  return (
    <div className="op-app">
      <SharedTopBar
        brand="opendocs" brandHref="https://opendocs.smithgajjar.dev" title="Documents" actions={[]}
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
            <MenuItem icon={<Icon name="settings" size={15} />} label="Settings" onClick={() => { close(); p.onSettings(); }} />
          </>
        )}
        avatar={{ name: p.author, onClick: p.onSettings }}
      />
      <div className="od-home">
        <div className="od-home-inner">
          <h1 className="od-home-title">Pick up where you left off</h1>
          <p className="od-home-sub">Documents on this device and the ones you opened from share links. Everything stays here until you publish it.</p>
          <label className="od-home-search">
            <Icon name="search" size={16} />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every word in your documents…" aria-label="Search documents" />
            <kbd>/</kbd>
          </label>

          {hits !== null ? (
            <section className="od-home-sec">
              <h2>{hits.length} result{hits.length === 1 ? '' : 's'}</h2>
              <div className="od-home-list">
                {hits.map((h) => (
                  <button key={h.doc} className="od-home-row" onClick={() => p.onOpen(h.doc)}>
                    <Icon name="description" size={16} />
                    <span className="od-home-row-main"><b>{h.title || titleOf(h.doc)}</b><span>{h.snippet}</span></span>
                  </button>
                ))}
                {hits.length === 0 && <div className="od-home-none">Nothing matches “{q.trim()}”. Every word must appear, quotes match a phrase, and -word excludes.</div>}
              </div>
            </section>
          ) : (
            <>
              {cards === null && <div className="od-home-grid" aria-hidden="true"><i /><i /><i /></div>}
              {cards !== null && cards.length > 0 && (
                <section className="od-home-sec">
                  <h2>On this device <span>{cards.length}</span></h2>
                  <div className="od-home-grid">
                    {cards.map((c) => (
                      <button key={c.slug} className="od-home-card" onClick={() => p.onOpen(c.slug)}>
                        <Icon name="description" size={18} />
                        <b>{c.title}</b>
                        <span>v{c.versions} · {c.open ? `${c.open} open comment${c.open === 1 ? '' : 's'}` : 'no open comments'}</span>
                        <em>{ago(c.updatedAt)}</em>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {p.shared.length > 0 && (
                <section className="od-home-sec">
                  <h2>Opened from links <span>{p.shared.length}</span></h2>
                  <div className="od-home-list">
                    {p.shared.map((s) => (
                      <div key={`${s.proxy}/${s.id}`} className="od-home-row od-home-row-link">
                        <a href={sharedHref(s)}>
                          <Icon name="link" size={16} />
                          <span className="od-home-row-main"><b>{s.title || 'Shared document'}</b><span>{s.role} · opened {ago(new Date(s.at).toISOString())}</span></span>
                        </a>
                        <button className="op-btn op-btn-ghost op-btn-sm" title="Forget this link" onClick={() => { forgetShared(s.id, s.proxy); p.onForgot(); }}>Forget</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {empty && (
                <div className="od-home-empty">
                  <Icon name="description" size={28} />
                  <h2>No documents yet</h2>
                  <p>Open the sample to see how review works, or load a folder of HTML files your agents wrote.</p>
                </div>
              )}
              <div className="od-home-actions">
                <Button kind="primary" size="md" onClick={p.onOpenSample}>Open the sample document</Button>
                {p.fsSupported && <Button kind="outline" size="md" icon={<Icon name="folder" size={14} />} onClick={p.onPickFolder}>Open a folder</Button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
