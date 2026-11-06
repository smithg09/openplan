import React from 'react';
import { SelectionToolbar, CommentPopover, SuggestionPopover } from '@openplan/toolbar';
import { api, bootstrap, captureToken, currentApiBase, currentToken, docFromPath, loadToken, subscribe, type ApiAnchor, type ApiComment, type ApiVersion, type Role } from './api';
import { buildThreads, threadToAnnotation, localAuthor } from './adapt';
import { TopBar } from './components/TopBar';
import { Home } from './components/Home';
import { type Example } from './examples';
import { WEB } from './env';
import { accountsEnabled, currentUser, type AccountUser } from './account';
import { AccountModal } from './components/AccountModal';
import { listShared, rememberShared, type SharedDoc } from './lib/recent';
import { LeftPanel, type Heading } from './components/LeftPanel';
import { AnchoredRail, type RailItem } from './components/AnchoredRail';
import { VersionHistoryModal } from './components/VersionHistoryModal';
import { ShareDrawer } from './components/ShareDrawer';
import { SettingsModal } from './components/SettingsModal';
import { ProxyModal } from './components/ProxyModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Icon, SlidePanel, RailHeader } from './components/ui';
import type { RailFilter } from '@openplan/chrome';
import { applyTheme, effectiveTheme, savedTheme, type Theme } from './lib/theme';
import { commentsToJSON, commentsToMarkdown, download } from './lib/exports';
import { fsAccessSupported, pickFolder, readFile, sha256Hex, slugify, type LocalFolder } from './lib/localfs';

type Rect = { top: number; left: number; width: number; height: number };
type BridgeMsg =
  | { type: 'opendocs:ready' }
  | { type: 'opendocs:selection'; anchor: ApiAnchor; rect: Rect }
  | { type: 'opendocs:selection-cleared' }
  | { type: 'opendocs:placements'; placements: { id: string; found: boolean }[] }
  | { type: 'opendocs:activate'; id: string }
  | { type: 'opendocs:scroll'; scrollTop: number }
  | { type: 'opendocs:layout'; scrollTop: number; scrollHeight: number; anchors: Record<string, number>; headings: Heading[] };

type Composer = null | 'comment' | 'question' | 'suggestion';

export default function App() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<'local' | 'proxy'>('local');
  const [role, setRole] = React.useState<Role>('editor');
  const [docs, setDocs] = React.useState<string[]>([]);
  const [docSlug, setDocSlug] = React.useState('');
  const [versions, setVersions] = React.useState<ApiVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = React.useState('');
  const [comments, setComments] = React.useState<ApiComment[]>([]);
  const [frameHtml, setFrameHtml] = React.useState('');
  const [layout, setLayout] = React.useState<{ scrollTop: number; scrollHeight: number; anchors: Record<string, number>; headings: Heading[] }>({ scrollTop: 0, scrollHeight: 0, anchors: {}, headings: [] });
  const [sel, setSel] = React.useState<{ anchor: ApiAnchor; rect: Rect } | null>(null);
  const [composer, setComposer] = React.useState<Composer>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [orphans, setOrphans] = React.useState<Set<string>>(new Set());
  const [viewers, setViewers] = React.useState(0);
  const [newVersion, setNewVersion] = React.useState(false);
  const [filter, setFilter] = React.useState<RailFilter>('all');
  const [railHead, setRailHead] = React.useState(0);
  const [modal, setModal] = React.useState<'share' | 'settings' | 'proxy' | 'history' | 'shortcuts' | 'account' | null>(null);
  const [user, setUser] = React.useState<AccountUser | null>(null);
  const refreshUser = React.useCallback(() => { if (accountsEnabled) void currentUser().then(setUser); }, []);
  React.useEffect(refreshUser, [refreshUser]);
  const [author, setAuthor] = React.useState(localAuthor());
  const [theme, setThemeState] = React.useState<Theme>(savedTheme());
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [railOpen, setRailOpen] = React.useState(true);
  const [focusMode, setFocusMode] = React.useState(false);
  const [folder, setFolder] = React.useState<LocalFolder | null>(null);
  const [importing, setImporting] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState('');
  const [view, setView] = React.useState<'home' | 'doc'>('doc');
  const [shared, setShared] = React.useState<SharedDoc[]>(() => listShared());

  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const paneRef = React.useRef<HTMLDivElement>(null);
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const railHeadRef = React.useRef<HTMLDivElement>(null);
  const commentsRef = React.useRef(comments);
  commentsRef.current = comments;
  const roleRef = React.useRef(role);
  roleRef.current = role;
  const composerRef = React.useRef(composer);
  composerRef.current = composer;
  const versionRef = React.useRef(currentVersionId);
  versionRef.current = currentVersionId;
  const themeRef = React.useRef<'dark' | 'light'>(effectiveTheme(theme));

  const canComment = role === 'commenter' || role === 'editor';
  const canWrite = role === 'editor';
  const canShare = mode === 'local' || role === 'editor';
  const showToast = React.useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(''), 2600); }, []);

  // ── theme ───────────────────────────────────────────────────────────────────
  const postToFrame = React.useCallback((msg: unknown) => { iframeRef.current?.contentWindow?.postMessage(msg, '*'); }, []);
  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    themeRef.current = applyTheme(t);
    postToFrame({ type: 'opendocs:theme', theme: themeRef.current });
  }, [postToFrame]);
  React.useEffect(() => {
    themeRef.current = applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => setTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme, setTheme]);

  React.useEffect(() => {
    const el = railHeadRef.current;
    if (!el) return;
    const measure = () => setRailHead(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [railOpen, focusMode, loading]);

  // ── data ────────────────────────────────────────────────────────────────────
  const refreshComments = React.useCallback(async (doc: string) => {
    const { comments } = await api.listComments(doc);
    setComments(comments ?? []);
    return comments ?? [];
  }, []);

  const refreshVersions = React.useCallback(async (doc: string, select?: 'latest') => {
    const { versions } = await api.listVersions(doc);
    const vs = versions ?? [];
    setVersions(vs);
    if (select === 'latest' && vs.length) setCurrentVersionId(vs[vs.length - 1].id);
    return vs;
  }, []);

  const openDoc = React.useCallback(async (doc: string) => {
    setView('doc');
    setSel(null); setComposer(null); setFocusId(null); setOrphans(new Set());
    setFrameHtml(''); setNewVersion(false); setLayout({ scrollTop: 0, scrollHeight: 0, anchors: {}, headings: [] });
    setDocSlug(doc);
    const vs = await refreshVersions(doc);
    setCurrentVersionId(vs.length ? vs[vs.length - 1].id : '');
    await refreshComments(doc);
  }, [refreshComments, refreshVersions]);

  React.useEffect(() => {
    (async () => {
      try {
        const session = await bootstrap();
        setMode(session.mode);
        let doc = session.focus;
        if (session.mode === 'proxy') {
          doc = docFromPath();
          captureToken(doc);
          loadToken(doc);
          setRole((await api.access(doc)).role);
        } else {
          const { docs } = await api.listDocs();
          setDocs(docs ?? []);
        }
        if (doc) await openDoc(doc);
        else setView('home');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [openDoc]);

  // Remember documents opened from a share link so the home page can take people back.
  const title0 = layout.headings.find((h) => h.level === 1)?.text || '';
  React.useEffect(() => {
    if (!WEB || mode !== 'proxy' || !docSlug) return;
    rememberShared({ id: docSlug, proxy: currentApiBase(), token: currentToken(), role, title: title0 });
    setShared(listShared());
  }, [mode, docSlug, role, title0]);

  const goHome = React.useCallback(async () => {
    if (mode === 'proxy') { window.location.assign(import.meta.env.BASE_URL); return; }
    try { setDocs((await api.listDocs()).docs ?? []); } catch { /* keep the old list */ }
    setShared(listShared());
    setDocSlug(''); setFrameHtml(''); setCurrentVersionId(''); setModal(null);
    if (WEB) history.replaceState(null, '', import.meta.env.BASE_URL);
    setView('home');
  }, [mode]);

  // The sandboxed iframe never makes a request of its own: the page fetches the
  // (bridge-injected) HTML as text — with the bearer token where needed — and hands
  // it over as srcdoc. In the hosted web app, browser-local documents are built in place.
  React.useEffect(() => {
    if (!docSlug || !currentVersionId) return;
    let live = true;
    setFrameHtml('');
    api.frameHtml(docSlug, currentVersionId)
      .then((t) => live && setFrameHtml(t))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [docSlug, currentVersionId]);

  // ── bridge ──────────────────────────────────────────────────────────────────
  const repaint = React.useCallback((list: ApiComment[]) => {
    const anchors = list.filter((c) => !c.rootCommentId && c.anchor).map((c) => ({ id: c.id, anchor: c.anchor, status: c.status, type: c.type ?? 'comment' }));
    postToFrame({ type: 'opendocs:paint', anchors });
  }, [postToFrame]);

  React.useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return; // opaque origin: filter by source
      const msg = ev.data as BridgeMsg;
      if (!msg || typeof msg.type !== 'string') return;
      switch (msg.type) {
        case 'opendocs:ready':
          postToFrame({ type: 'opendocs:theme', theme: themeRef.current });
          repaint(commentsRef.current);
          break;
        case 'opendocs:selection':
          if (roleRef.current !== 'viewer') setSel({ anchor: msg.anchor, rect: msg.rect });
          break;
        case 'opendocs:selection-cleared':
          if (!composerRef.current) setSel(null);
          break;
        case 'opendocs:placements':
          setOrphans(new Set(msg.placements.filter((p) => !p.found).map((p) => p.id)));
          break;
        case 'opendocs:activate':
          setFocusId(msg.id);
          break;
        case 'opendocs:scroll':
          setLayout((l) => (l.scrollTop === msg.scrollTop ? l : { ...l, scrollTop: msg.scrollTop }));
          break;
        case 'opendocs:layout':
          setLayout({ scrollTop: msg.scrollTop, scrollHeight: msg.scrollHeight, anchors: msg.anchors, headings: msg.headings });
          break;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [repaint, postToFrame]);

  // Live updates from other people.
  React.useEffect(() => {
    if (!docSlug) return;
    const ac = new AbortController();
    void subscribe(docSlug, (ev) => {
      if (ev.type === 'presence') setViewers(ev.count ?? 0);
      if (ev.type === 'comments') void refreshComments(docSlug).then(repaint).catch(() => {});
      if (ev.type === 'versions') {
        void api.listVersions(docSlug).then(({ versions }) => {
          const vs = versions ?? [];
          setVersions(vs);
          if (vs.length && vs[vs.length - 1].id !== versionRef.current) setNewVersion(true);
        }).catch(() => {});
      }
    }, ac.signal);
    return () => ac.abort();
  }, [docSlug, refreshComments, repaint]);

  // ── comment actions ─────────────────────────────────────────────────────────
  const afterChange = React.useCallback(async () => { repaint(await refreshComments(docSlug)); }, [docSlug, refreshComments, repaint]);

  const addAnnotation = React.useCallback(async (a: { type: NonNullable<ApiComment['type']>; body: string; suggestion?: string }) => {
    if (!sel) return;
    await api.addComment(docSlug, { type: a.type, body: a.body, suggestion: a.suggestion, author, createdOnVersionId: currentVersionId, anchor: sel.anchor });
    setSel(null); setComposer(null);
    await afterChange();
  }, [sel, docSlug, author, currentVersionId, afterChange]);

  const onToolbar = (type: string, meta?: { emoji?: string }) => {
    if (type === 'comment' || type === 'question' || type === 'suggestion') setComposer(type);
    else if (type === 'deletion') void addAnnotation({ type: 'deletion', body: '' });
    else if (type === 'emoji' && meta?.emoji) void addAnnotation({ type: 'emoji', body: meta.emoji });
  };

  const onResolve = async (id: string) => {
    const c = comments.find((x) => x.id === id);
    if (!c) return;
    await api.setStatus(docSlug, id, c.status === 'resolved' ? 'open' : 'resolved');
    await afterChange();
  };
  const onReply = async (id: string, body: string) => {
    await api.addComment(docSlug, { body, author, createdOnVersionId: currentVersionId, rootCommentId: id });
    await afterChange();
  };

  // ── versions, import, export ────────────────────────────────────────────────
  const latestId = versions[versions.length - 1]?.id ?? '';
  const versionNo = Math.max(1, versions.findIndex((v) => v.id === currentVersionId) + 1);
  const title = layout.headings.find((h) => h.level === 1)?.text || docSlug;

  const importHtml = async (slug: string, html: string, label: string): Promise<void> => {
    const hash = await sha256Hex(html);
    const { versions: vs } = await api.listVersions(slug).catch(() => ({ versions: [] as ApiVersion[] | null }));
    const head = (vs ?? [])[(vs ?? []).length - 1];
    if (!head || head.contentHash !== hash) await api.createVersion(slug, { html, label, expectedHead: head?.id });
  };

  const openLocalFile = async (path: string) => {
    const f = folder?.files.find((x) => x.path === path);
    if (!f) return;
    setImporting(path);
    try {
      const html = await readFile(f);
      const slug = slugify(path.replace(/\.html?$/i, ''));
      await importHtml(slug, html, path);
      setDocs((await api.listDocs()).docs ?? []);
      await openDoc(slug);
    } catch (e) { showToast(e instanceof Error ? e.message : String(e)); } finally { setImporting(null); }
  };

  const onUploadFile = async (file: File) => {
    try {
      const html = await file.text();
      await api.createVersion(docSlug, { html, label: file.name, expectedHead: latestId || undefined });
      await refreshVersions(docSlug, 'latest');
      showToast(`Uploaded ${file.name} as a new version`);
    } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
  };

  const restore = async (id: string) => {
    await api.restoreVersion(docSlug, id, latestId || undefined);
    await refreshVersions(docSlug, 'latest');
    showToast('Restored as the new latest version');
  };

  const openSample = async () => {
    try {
      const smp = await api.sample();
      await importHtml(smp.slug, smp.html, 'sample');
      setDocs((await api.listDocs()).docs ?? []);
      await openDoc(smp.slug);
    } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
  };

  const openExample = async (ex: Example) => {
    try {
      await importHtml(ex.slug, ex.html, ex.title);
      setDocs((await api.listDocs()).docs ?? []);
      if (WEB) history.replaceState(null, '', `${import.meta.env.BASE_URL}?doc=${encodeURIComponent(ex.slug)}`);
      await openDoc(ex.slug);
    } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
  };

  // An HTML file chosen on the home page becomes its own document and opens for review.
  const uploadAsDoc = async (file: File) => {
    try {
      const html = await file.text();
      const base = slugify(file.name.replace(/\.html?$/i, '')) || 'document';
      await importHtml(base, html, file.name);
      setDocs((await api.listDocs()).docs ?? []);
      if (WEB) history.replaceState(null, '', `${import.meta.env.BASE_URL}?doc=${encodeURIComponent(base)}`);
      await openDoc(base);
    } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
  };

  const exportMd = () => download(`${docSlug}-comments.md`, commentsToMarkdown(title, comments), 'text/markdown');
  const exportJson = () => download(`${docSlug}-comments.json`, commentsToJSON(comments), 'application/json');
  const downloadHtml = async () => {
    try { download(`${docSlug}.html`, await api.rawVersion(docSlug, currentVersionId), 'text/html'); }
    catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
  };

  // ── keyboard ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '[') setLeftOpen((v) => !v);
      else if (e.key === ']') setRailOpen((v) => !v);
      else if (e.key === 'f') setFocusMode((v) => !v);
      else if (e.key === 'h') setModal('history');
      else if (e.key === '?') setModal('shortcuts');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── render ──────────────────────────────────────────────────────────────────
  if (loading) return <div className="op-loading-center"><div className="op-spinner" /></div>;
  if (error) return <div className="od-fatal"><Icon name="warning" size={20} /><div>{error}</div></div>;

  if (view === 'home') {
    return (
      <>
        <Home
          docs={docs} shared={shared} fsSupported={fsAccessSupported()} author={user?.name ?? author} theme={theme}
          account={accountsEnabled ? { user, onOpen: () => setModal('account') } : undefined}
          onOpen={(slug) => { if (WEB) history.replaceState(null, '', `${import.meta.env.BASE_URL}?doc=${encodeURIComponent(slug)}`); void openDoc(slug); }}
          onOpenExample={(ex) => void openExample(ex)}
          onUpload={(f) => void uploadAsDoc(f)}
          onDelete={async (slug) => { await api.deleteDoc(slug); setDocs((await api.listDocs()).docs ?? []); }}
          onPickFolder={async () => {
            try {
              const f = await pickFolder();
              if (f) { setFolder(f); showToast(f.files.length ? `Found ${f.files.length} HTML file${f.files.length === 1 ? '' : 's'} in “${f.name}”` : `No HTML files found in “${f.name}”`); }
            } catch (e) { showToast(`Could not open the folder: ${e instanceof Error ? e.message : String(e)}`); }
          }}
          folder={folder} importing={importing} onOpenLocalFile={(path) => void openLocalFile(path)} onCloseFolder={() => setFolder(null)}
          onSetTheme={setTheme} onSettings={() => setModal('settings')} onProxy={() => setModal('proxy')} onShortcuts={() => setModal('shortcuts')}
          onForgot={() => setShared(listShared())}
        />
        {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} onAuthorChange={setAuthor} onThemeChange={setTheme} />}
      {modal === 'proxy' && <ProxyModal mode={mode} onClose={() => setModal(null)} />}
        {modal === 'shortcuts' && <ShortcutsModal onClose={() => setModal(null)} />}
        {modal === 'account' && <AccountModal mode={mode} user={user} onClose={() => setModal(null)} onChanged={refreshUser} onAuthorChange={setAuthor} />}
        {toast && <div className="op-toast-wrap"><div className="op-toast"><span className="op-toast-bullet">●</span><span>{toast}</span></div></div>}
      </>
    );
  }

  const threads = buildThreads(comments);
  const openCount = threads.filter((t) => t.root.status !== 'resolved').length;
  const counts = { all: threads.length, open: openCount, resolved: threads.length - openCount };
  const shown = threads.filter((t) => (filter === 'all' ? true : filter === 'open' ? t.root.status !== 'resolved' : t.root.status === 'resolved'));
  const items: RailItem[] = shown.map((t) => ({
    id: t.root.id,
    anno: threadToAnnotation(t, author),
    resolved: t.root.status === 'resolved',
    orphaned: orphans.has(t.root.id),
    canEdit: canComment && t.root.type !== 'emoji' && (mode === 'local' || !!t.root.mine),
    canRemove: canComment && (mode === 'local' || !!t.root.mine || role === 'editor'),
  }));

  // Floating toolbar / popover, in viewport coordinates (the iframe fills the pane).
  const pane = paneRef.current?.getBoundingClientRect();
  let toolbarPos: { x: number; y: number } | null = null;
  let popPos: { x: number; y: number } | null = null;
  if (sel && pane && canComment) {
    const r = sel.rect;
    const inView = r.top + r.height > 0 && r.top < pane.height;
    if (inView) {
      const cx = pane.left + r.left + r.width / 2;
      const above = pane.top + r.top - 46;
      toolbarPos = { x: Math.max(pane.left + 6, Math.min(cx - 86, pane.right - 180)), y: above < pane.top + 6 ? pane.top + r.top + r.height + 12 : above };
      popPos = { x: Math.max(pane.left + 8, Math.min(cx - 160, pane.right - 332)), y: Math.min(pane.top + r.top + r.height + 12, pane.bottom - 250) };
    }
  }

  const showLeft = leftOpen && !focusMode;
  const showRail = railOpen && !focusMode;

  return (
    <div className="op-app">
      <TopBar
        mode={mode} title={title} versionNo={versionNo} isLatest={!latestId || currentVersionId === latestId}
        role={role} viewers={viewers} newVersion={newVersion} author={user?.name ?? author} theme={theme}
        leftOpen={leftOpen} railOpen={railOpen} focusMode={focusMode}
        canShare={canShare} canWrite={canWrite} openComments={openCount}
        onHistory={() => setModal('history')} onShare={() => setModal('share')}
        onToggleLeft={() => setLeftOpen((v) => !v)} onToggleRail={() => setRailOpen((v) => !v)} onToggleFocus={() => setFocusMode((v) => !v)}
        onViewLatest={() => { if (latestId) setCurrentVersionId(latestId); setNewVersion(false); setOrphans(new Set()); }}
        onSetTheme={setTheme} onExportMd={exportMd} onExportJson={exportJson} onDownloadHtml={() => void downloadHtml()}
        onPrint={() => postToFrame({ type: 'opendocs:print' })} onUploadVersion={() => uploadRef.current?.click()}
        onSettings={() => setModal('settings')} onProxy={() => setModal('proxy')} onShortcuts={() => setModal('shortcuts')}
        onHome={mode === 'local' || WEB ? () => void goHome() : undefined}
        account={accountsEnabled ? { user, onOpen: () => setModal('account') } : undefined}
      />
      <input ref={uploadRef} type="file" accept=".html,.htm,text/html" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadFile(f); e.target.value = ''; }} />

      <div className="op-app-body">
        <SlidePanel open={showLeft} side="left" width={220}>
          <LeftPanel
            mode={mode} docs={docs} currentDoc={docSlug} headings={layout.headings} scrollTop={layout.scrollTop}
            folder={folder} fsSupported={fsAccessSupported()} openCounts={{ [docSlug]: openCount }} importing={importing}
            onOpenDoc={(d) => { if (WEB) history.replaceState(null, '', `${import.meta.env.BASE_URL}?doc=${encodeURIComponent(d)}`); void openDoc(d); }} onHeading={(id) => postToFrame({ type: 'opendocs:scroll-to-heading', id })}
            onPickFolder={async () => { try { const f = await pickFolder(); if (f) setFolder(f); } catch (e) { showToast(e instanceof Error ? e.message : String(e)); } }}
            onOpenLocalFile={(p) => { void openLocalFile(p); }}
          />
        </SlidePanel>

        <div className="od-doc-pane" ref={paneRef}>
          {!docSlug && (
            <div className="od-empty-doc">
              <Icon name="description" size={30} />
              <h2>{mode === 'proxy' ? 'Open a share link' : 'No document open'}</h2>
              <p>{mode === 'proxy' ? 'Ask the document’s owner for a link.' : <>Pick a document on the left, open a folder of HTML files, or run <code>opendocs open report.html</code>.</>}</p>
              {mode === 'local' && <button className="op-btn op-btn-primary op-btn-md" style={{ marginTop: 10 }} onClick={() => void openSample()}>Open the sample document</button>}
            </div>
          )}
          {docSlug && !frameHtml && <div className="od-skeleton" aria-hidden="true"><i /><i /><i /><i /></div>}
          {currentVersionId && frameHtml && (
            <iframe key={currentVersionId} ref={iframeRef} className="od-frame" sandbox="allow-scripts allow-modals" srcDoc={frameHtml} title="document" />
          )}
          {toast && <div className="op-toast-wrap"><div className="op-toast"><span className="op-toast-bullet">●</span><span>{toast}</span></div></div>}
        </div>

        <SlidePanel open={showRail} side="right" width={340}>
          <div className="od-rail">
            <div ref={railHeadRef}>
              <RailHeader count={openCount} filter={filter} counts={counts} onFilter={setFilter} onCopyMD={() => { void navigator.clipboard.writeText(commentsToMarkdown(title, comments)).then(() => showToast('Comments copied as Markdown')); }} onClose={() => setRailOpen(false)} />
            </div>
            {items.length === 0 && (
              <div className="od-rail-empty">
                <Icon name="chat_bubble" size={22} />
                <div>{filter !== 'all' ? `No ${filter} comments.` : canComment ? 'Select text in the document to comment, ask or suggest.' : 'View-only link — you can read comments but not add them.'}</div>
              </div>
            )}
            <AnchoredRail
              items={items} anchors={layout.anchors} scrollTop={layout.scrollTop} scrollHeight={layout.scrollHeight} offset={railHead}
              focusId={focusId} canComment={canComment}
              onFocus={(id) => { setFocusId(id); postToFrame({ type: 'opendocs:scroll-to', id }); }}
              onEdit={async (id, body) => { await api.editComment(docSlug, id, body); await afterChange(); }}
              onRemove={async (id) => { await api.deleteComment(docSlug, id); await afterChange(); }}
              onResolve={onResolve} onReply={onReply}
              onReact={async (id, emoji) => { await api.react(docSlug, id, emoji, author); await afterChange(); }}
              onWheel={(dy) => postToFrame({ type: 'opendocs:scroll-by', dy })}
            />
          </div>
        </SlidePanel>
      </div>

      {sel && toolbarPos && !composer && <SelectionToolbar pos={toolbarPos} onAction={onToolbar} />}
      {sel && popPos && composer === 'suggestion' && (
        <SuggestionPopover pos={popPos} quote={sel.anchor.quote} onCancel={() => { setComposer(null); setSel(null); }} onSave={(body, suggestion) => void addAnnotation({ type: 'suggestion', body, suggestion })} />
      )}
      {sel && popPos && (composer === 'comment' || composer === 'question') && (
        <CommentPopover pos={popPos} type={composer} quote={sel.anchor.quote} onCancel={() => { setComposer(null); setSel(null); }} onSave={(body) => void addAnnotation({ type: composer, body })} />
      )}

      {modal === 'history' && (
        <VersionHistoryModal versions={versions} currentId={currentVersionId} canRestore={canWrite}
          onOpen={(id) => { setCurrentVersionId(id); setOrphans(new Set()); if (id === latestId) setNewVersion(false); }}
          onRestore={restore} onClose={() => setModal(null)} />
      )}
      {modal === 'share' && <ShareDrawer mode={mode} doc={docSlug} onClose={() => setModal(null)} onOpenSettings={() => setModal('proxy')} />}
      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} onAuthorChange={setAuthor} onThemeChange={setTheme} />}
      {modal === 'proxy' && <ProxyModal mode={mode} onClose={() => setModal(null)} />}
      {modal === 'shortcuts' && <ShortcutsModal onClose={() => setModal(null)} />}
      {modal === 'account' && <AccountModal mode={mode} user={user} onClose={() => setModal(null)} onChanged={refreshUser} onAuthorChange={setAuthor} />}
    </div>
  );
}
