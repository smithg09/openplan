import React from 'react';
import { AnnoCard } from '@openplan/annotations';
import { Menu } from './components/Modal';
import { ShareModal } from './components/ShareModal';
import { SettingsModal, applyTheme, savedTheme } from './components/SettingsModal';
import { api, captureToken, docFromPath, frameURL, loadToken, subscribe, type ApiAnchor, type ApiComment, type ApiVersion, type Role } from './api';
import { buildThreads, threadToAnnotation, localAuthor } from './adapt';

/** Messages from the in-iframe bridge. */
type BridgeMsg =
  | { type: 'opendocs:ready' }
  | { type: 'opendocs:selection'; anchor: ApiAnchor; rect: DOMRectInit }
  | { type: 'opendocs:selection-cleared' }
  | { type: 'opendocs:placements'; placements: { id: string; found: boolean }[] }
  | { type: 'opendocs:activate'; id: string };

export default function App() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [docSlug, setDocSlug] = React.useState('');
  const [versions, setVersions] = React.useState<ApiVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = React.useState('');
  const [comments, setComments] = React.useState<ApiComment[]>([]);
  const [sel, setSel] = React.useState<{ anchor: ApiAnchor; rect: { top: number; left: number; width: number; height: number } } | null>(null);
  const [composing, setComposing] = React.useState(false);
  const [docs, setDocs] = React.useState<string[]>([]);
  const [modal, setModal] = React.useState<'share' | 'settings' | null>(null);
  const [author, setAuthor] = React.useState(localAuthor());
  const [draft, setDraft] = React.useState('');
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [orphans, setOrphans] = React.useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = React.useState(false);
  const [mode, setMode] = React.useState<'local' | 'proxy'>('local');
  const [role, setRole] = React.useState<Role>('editor');
  const [frameSrc, setFrameSrc] = React.useState('');
  const [frameHtml, setFrameHtml] = React.useState('');
  const [viewers, setViewers] = React.useState(0);
  const [newVersion, setNewVersion] = React.useState(false);

  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const me = author;
  const paneRef = React.useRef<HTMLDivElement>(null);
  const composingRef = React.useRef(false);
  composingRef.current = composing;
  React.useEffect(() => { applyTheme(savedTheme()); }, []);

  // Refs so the once-registered message handler reads fresh state.
  const commentsRef = React.useRef(comments);
  commentsRef.current = comments;
  const roleRef = React.useRef(role);
  roleRef.current = role;
  const versionRef = React.useRef(currentVersionId);
  versionRef.current = currentVersionId;

  // ── data loading ──────────────────────────────────────────────────────────
  const refreshComments = React.useCallback(async (doc: string) => {
    const { comments } = await api.listComments(doc);
    setComments(comments ?? []);
    return comments ?? [];
  }, []);

  // Open (or switch to) a document: load its versions and comments and reset
  // everything that belongs to the previous one.
  const openDoc = React.useCallback(async (doc: string) => {
    setSel(null); setComposing(false); setDraft(''); setFocusId(null); setOrphans(new Set());
    setFrameHtml(''); setNewVersion(false);
    setDocSlug(doc);
    const { versions } = await api.listVersions(doc);
    const vs = versions ?? [];
    setVersions(vs);
    setCurrentVersionId(vs.length ? vs[vs.length - 1].id : '');
    await refreshComments(doc);
  }, [refreshComments]);

  React.useEffect(() => {
    (async () => {
      try {
        const session = await api.session();
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
          if (!doc) doc = (docs && docs[0]) || '';
        }
        if (!doc) {
          setLoading(false);
          return;
        }
        await openDoc(doc);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [openDoc]);

  // The iframe can't send an Authorization header, so in proxy mode fetch a
  // short-lived signed URL for the selected version (never the token itself).
  React.useEffect(() => {
    if (!docSlug || !currentVersionId) return;
    if (mode !== 'proxy') {
      setFrameSrc(frameURL(docSlug, currentVersionId));
      return;
    }
    let live = true;
    api.frameUrl(docSlug, currentVersionId)
      .then((r) => live && setFrameSrc(r.url))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [mode, docSlug, currentVersionId]);

  // Load the (bridge-injected) HTML as text and give it to the iframe as srcdoc.
  // This keeps the doc in an opaque-origin sandbox without the iframe making its
  // own network request — some embedders (incl. Claude's preview pane) block
  // requests from sandboxed subframes (ERR_BLOCKED_BY_CLIENT).
  React.useEffect(() => {
    if (!frameSrc) return;
    let live = true;
    setFrameHtml('');
    fetch(frameSrc)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`document failed to load (${r.status})`))))
      .then((t) => live && setFrameHtml(t))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [frameSrc]);

  const canComment = role === 'commenter' || role === 'editor';

  // ── bridge messaging ────────────────────────────────────────────────────────
  const postToFrame = React.useCallback((msg: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*');
  }, []);

  const repaint = React.useCallback(
    (list: ApiComment[]) => {
      const anchors = list
        .filter((c) => !c.rootCommentId && c.anchor)
        .map((c) => ({ id: c.id, anchor: c.anchor, status: c.status }));
      postToFrame({ type: 'opendocs:paint', anchors });
    },
    [postToFrame],
  );

  // Live updates: another person commenting or publishing shows up without a reload.
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
          // Don't yank the page out from under a reader; offer the switch instead.
          if (vs.length && vs[vs.length - 1].id !== versionRef.current) setNewVersion(true);
        }).catch(() => {});
      }
    }, ac.signal);
    return () => ac.abort();
  }, [docSlug, refreshComments, repaint]);


  React.useEffect(() => {
    function onMessage(ev: MessageEvent) {
      // Sandboxed iframe has an opaque origin ("null"), so filter by source.
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = ev.data as BridgeMsg;
      if (!msg || typeof msg.type !== 'string') return;
      switch (msg.type) {
        case 'opendocs:ready':
          repaint(commentsRef.current);
          break;
        case 'opendocs:selection':
          if (roleRef.current !== 'viewer') setSel({ anchor: msg.anchor, rect: msg.rect as { top: number; left: number; width: number; height: number } });
          break;
        case 'opendocs:selection-cleared':
          // Keep the box while the reviewer is writing; otherwise drop the toolbar.
          if (!composingRef.current) setSel(null);
          break;
        case 'opendocs:placements': {
          const missing = new Set(msg.placements.filter((p) => !p.found).map((p) => p.id));
          setOrphans(missing);
          break;
        }
        case 'opendocs:activate':
          setFocusId(msg.id);
          break;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [repaint]);

  // ── actions ───────────────────────────────────────────────────────────────
  const afterChange = React.useCallback(async () => {
    const list = await refreshComments(docSlug);
    repaint(list);
  }, [docSlug, refreshComments, repaint]);

  const cancelCompose = React.useCallback(() => { setSel(null); setComposing(false); setDraft(''); }, []);

  const submitComment = React.useCallback(async () => {
    if (!sel || !draft.trim()) return;
    await api.addComment(docSlug, {
      body: draft.trim(),
      author: me,
      createdOnVersionId: currentVersionId,
      anchor: sel.anchor,
    });
    cancelCompose();
    await afterChange();
  }, [sel, draft, docSlug, me, currentVersionId, afterChange, cancelCompose]);

  const onResolve = React.useCallback(
    async (id: string) => {
      const c = comments.find((x) => x.id === id);
      if (!c) return;
      await api.setStatus(docSlug, id, c.status === 'resolved' ? 'open' : 'resolved');
      await afterChange();
    },
    [comments, docSlug, afterChange],
  );

  const onReply = React.useCallback(
    async (id: string, body: string) => {
      await api.addComment(docSlug, {
        body,
        author: me,
        createdOnVersionId: currentVersionId,
        rootCommentId: id,
      });
      await afterChange();
    },
    [docSlug, me, currentVersionId, afterChange],
  );

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="od-loading">loading…</div>;
  if (error) return <div className="od-loading od-error">error: {error}</div>;
  if (!docSlug) return <div className="od-loading">{mode === 'proxy' ? 'Open a share link to view a document.' : <>No documents yet — run <code>&nbsp;opendocs open &lt;file&gt;&nbsp;</code></>}</div>;

  const threads = buildThreads(comments);
  const openCount = threads.filter((t) => t.root.status !== 'resolved').length;
  const canShare = mode === 'local' || role === 'editor';

  // Floating comment UI, positioned from the selection rect the bridge reports
  // (iframe viewport coordinates; the iframe fills the pane at 0,0).
  const pane = paneRef.current?.getBoundingClientRect();
  const PW = 336, PH = 214, TW = 116, TH = 34;
  let float: { left: number; top: number } | null = null;
  if (sel && pane && canComment) {
    const r = sel.rect;
    const visible = r.top + r.height > 0 && r.top < pane.height;
    if (visible) {
      const w = composing ? PW : TW, h = composing ? PH : TH;
      const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, pane.width - w - 8));
      const below = r.top + r.height + 10;
      const top = below + h > pane.height ? Math.max(8, r.top - h - 10) : below;
      float = { left, top };
    }
  }

  return (
    <div className="od-app">
      <div className="od-topbar">
        <span className="od-brand"><span className="od-p">$</span><span className="od-s">/</span><b>opendocs</b></span>
        {mode === 'local' && docs.length > 1 ? (
          <Menu
            align="left"
            trigger={<span className="od-doc-title">{docSlug} <span className="od-caret">▾</span></span>}
            items={docs.map((d) => ({ label: d, hint: d === docSlug ? '✓' : undefined, onSelect: () => { void openDoc(d); } }))}
          />
        ) : (
          <span className="od-doc-title">{docSlug}</span>
        )}
        <div className="od-spacer" />
        {viewers > 1 && <span className="od-role" title="People viewing this document right now">{viewers} here</span>}
        {newVersion && (
          <button className="od-btn od-btn-ghost" onClick={() => { const last = versions[versions.length - 1]; if (last) { setCurrentVersionId(last.id); setOrphans(new Set()); } setNewVersion(false); }}>
            New version — view
          </button>
        )}
        {mode === 'proxy' && <span className="od-role" title="What this link allows">{role}</span>}
        {versions.length > 0 && (
          <select
            className="od-select"
            value={currentVersionId}
            onChange={(e) => {
              setCurrentVersionId(e.target.value);
              setOrphans(new Set());
              if (versions.length && e.target.value === versions[versions.length - 1].id) setNewVersion(false);
            }}
          >
            {versions.map((v, i) => (
              <option key={v.id} value={v.id}>
                {v.label || `version ${i + 1}`}
                {i === versions.length - 1 ? ' (latest)' : ''}
              </option>
            ))}
          </select>
        )}
        {mode === 'local' && (
          <button
            className="od-btn od-btn-ghost"
            disabled={submitted}
            title="Tell the agent you're done; it receives your open comments"
            onClick={async () => {
              try { await api.submitReview(); setSubmitted(true); }
              catch (e) { setError(e instanceof Error ? e.message : String(e)); }
            }}
          >
            {submitted ? 'Review submitted ✓' : 'Submit review'}
          </button>
        )}
        {canShare && <button className="od-btn od-btn-primary" onClick={() => setModal('share')}>Share</button>}
        <Menu
          trigger={<span className="od-gear" aria-label="Menu">⋯</span>}
          items={[
            ...(canShare ? [{ label: 'Share…', onSelect: () => setModal('share') }] : []),
            { label: 'Settings…', onSelect: () => setModal('settings') },
            'sep' as const,
            { label: 'Documentation', onSelect: () => window.open('https://github.com/smithg09/openplan', '_blank', 'noreferrer') },
            { label: 'About opendocs', onSelect: () => window.open('https://opendocs.smithgajjar.dev', '_blank', 'noreferrer') },
          ]}
        />
      </div>

      <div className="od-body">
        <div className="od-doc-pane" ref={paneRef}>
          {currentVersionId && frameHtml && (
            <iframe
              key={currentVersionId}
              ref={iframeRef}
              className="od-frame"
              sandbox="allow-scripts"
              srcDoc={frameHtml}
              title="document"
            />
          )}

          {float && sel && !composing && (
            <button
              className="od-float-btn"
              style={{ left: float.left, top: float.top }}
              onMouseDown={(e) => e.preventDefault() /* keep the document selection */}
              onClick={() => setComposing(true)}
            >
              <span aria-hidden>💬</span> Comment
            </button>
          )}
          {float && sel && composing && (
            <div className="od-float" style={{ left: float.left, top: float.top, width: PW }} role="dialog" aria-label="Add a comment">
              <div className="od-composer-quote">{sel.anchor.quote}</div>
              <textarea
                autoFocus
                value={draft}
                placeholder="Add a comment…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cancelCompose();
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submitComment(); }
                }}
              />
              <div className="od-composer-actions">
                <span className="od-faint-s">⌘↵ to post</span>
                <div className="od-grow" />
                <button className="od-btn od-btn-ghost" onClick={cancelCompose}>Cancel</button>
                <button className="od-btn od-btn-primary" disabled={!draft.trim()} onClick={() => void submitComment()}>Comment</button>
              </div>
            </div>
          )}
        </div>

        <div className="od-rail">
          <div className="od-rail-head">
            <span>Comments</span>
            <div className="od-spacer" />
            <span>{openCount} open</span>
          </div>
          <div className="od-rail-list">
            {threads.length === 0 && (
              <div className="od-empty">{canComment ? 'Select text in the document to comment.' : 'View-only link — you can read comments but not add them.'}</div>
            )}

            {threads.map((t) => (
              <div key={t.root.id}>
                {orphans.has(t.root.id) && (
                  <div className="od-orphan">⚠ orphaned in this version</div>
                )}
                <AnnoCard
                  anno={threadToAnnotation(t, me)}
                  isFocus={focusId === t.root.id}
                  onClick={() => { setFocusId(t.root.id); postToFrame({ type: 'opendocs:scroll-to', id: t.root.id }); }}
                  onEdit={canComment && (mode === 'local' || t.root.mine) ? async (id, body) => { await api.editComment(docSlug, id, body); await afterChange(); } : undefined}
                  onRemove={canComment && (mode === 'local' || t.root.mine || role === 'editor') ? async () => { await api.deleteComment(docSlug, t.root.id); await afterChange(); } : undefined}
                  onResolve={canComment ? onResolve : undefined}
                  onReply={canComment ? onReply : undefined}
                  onReact={canComment ? async (id, emoji) => { await api.react(docSlug, id, emoji, me); await afterChange(); } : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {modal === 'share' && <ShareModal mode={mode} doc={docSlug} onClose={() => setModal(null)} onOpenSettings={() => setModal('settings')} />}
      {modal === 'settings' && <SettingsModal mode={mode} onClose={() => setModal(null)} onAuthorChange={setAuthor} />}
    </div>
  );
}
