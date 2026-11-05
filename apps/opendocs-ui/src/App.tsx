import React from 'react';
import { AnnoCard } from '@openplan/annotations';
import { api, captureToken, docFromPath, frameURL, loadToken, type ApiAnchor, type ApiComment, type ApiVersion, type Role } from './api';
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
  const [pending, setPending] = React.useState<ApiAnchor | null>(null);
  const [draft, setDraft] = React.useState('');
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [orphans, setOrphans] = React.useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = React.useState(false);
  const [mode, setMode] = React.useState<'local' | 'proxy'>('local');
  const [role, setRole] = React.useState<Role>('editor');
  const [frameSrc, setFrameSrc] = React.useState('');

  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const me = React.useMemo(() => localAuthor(), []);

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
        } else if (!doc) {
          const { docs } = await api.listDocs();
          doc = (docs && docs[0]) || '';
        }
        if (!doc) {
          setLoading(false);
          return;
        }
        setDocSlug(doc);
        const { versions } = await api.listVersions(doc);
        const vs = versions ?? [];
        setVersions(vs);
        setCurrentVersionId(vs.length ? vs[vs.length - 1].id : '');
        await refreshComments(doc);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshComments]);

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
          if (roleRef.current !== 'viewer') setPending(msg.anchor);
          break;
        case 'opendocs:placements': {
          const missing = new Set(msg.placements.filter((p) => !p.found).map((p) => p.id));
          setOrphans(missing);
          break;
        }
        case 'opendocs:activate':
          setFocusId(msg.id);
          break;
        // selection-cleared intentionally ignored: keep the draft until the
        // reviewer submits or cancels.
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

  const submitComment = React.useCallback(async () => {
    if (!pending || !draft.trim()) return;
    await api.addComment(docSlug, {
      body: draft.trim(),
      author: me,
      createdOnVersionId: currentVersionId,
      anchor: pending,
    });
    setPending(null);
    setDraft('');
    await afterChange();
  }, [pending, draft, docSlug, me, currentVersionId, afterChange]);

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

  return (
    <div className="od-app">
      <div className="od-topbar">
        <span className="od-brand"><span className="od-accent">◆</span> <b>opendocs</b></span>
        <span className="od-doc-title">{docSlug}</span>
        <div className="od-spacer" />
        {versions.length > 0 && (
          <select
            className="od-select"
            value={currentVersionId}
            onChange={(e) => {
              setCurrentVersionId(e.target.value);
              setOrphans(new Set());
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
        {mode === 'proxy' && <span className="od-role" title="What this link allows">{role}</span>}
        {mode === 'local' && <button
          className="od-btn od-btn-primary"
          disabled={submitted}
          title="Tell the agent you're done; it receives your open comments"
          onClick={async () => {
            try { await api.submitReview(); setSubmitted(true); }
            catch (e) { setError(e instanceof Error ? e.message : String(e)); }
          }}
        >
          {submitted ? 'Review submitted ✓' : 'Submit review'}
        </button>}
      </div>

      <div className="od-body">
        <div className="od-doc-pane">
          {currentVersionId && frameSrc && (
            <iframe
              key={currentVersionId}
              ref={iframeRef}
              className="od-frame"
              sandbox="allow-scripts"
              src={frameSrc}
              title="document"
            />
          )}
        </div>

        <div className="od-rail">
          <div className="od-rail-head">
            <span>Comments</span>
            <div className="od-spacer" />
            <span>{openCount} open</span>
          </div>
          <div className="od-rail-list">
            {pending && (
              <div className="od-composer">
                <div className="od-composer-quote">{pending.quote}</div>
                <textarea
                  autoFocus
                  value={draft}
                  placeholder="Add a comment…"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setPending(null); setDraft(''); }
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submitComment(); }
                  }}
                />
                <div className="od-composer-actions">
                  <button className="od-btn od-btn-ghost" onClick={() => { setPending(null); setDraft(''); }}>Cancel</button>
                  <button className="od-btn od-btn-primary" disabled={!draft.trim()} onClick={() => void submitComment()}>Comment</button>
                </div>
              </div>
            )}

            {threads.length === 0 && !pending && (
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
    </div>
  );
}
