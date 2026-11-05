import React from 'react';

type C = { id: number; quote: string; body: string };

const DOC = `<h4>Rollout plan — beta</h4>
<p>We will release the beta to <b>500 design-partner accounts</b> on September 12, behind a feature flag, with a staged rollout over two weeks.</p>
<p>Support coverage is business hours only until the on-call rota is staffed. The rollback plan is documented in section 4.</p>`;

/** A working miniature of the review UI: select text, get the floating box, comment. */
export default function TryIt() {
  const wrap = React.useRef<HTMLDivElement>(null);
  const docRef = React.useRef<HTMLDivElement>(null);
  const [sel, setSel] = React.useState<{ quote: string; x: number; y: number; range: Range } | null>(null);
  const [composing, setComposing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [comments, setComments] = React.useState<C[]>([]);

  React.useEffect(() => { if (docRef.current) docRef.current.innerHTML = DOC; }, []);

  const onMouseUp = () => {
    const s = window.getSelection();
    const doc = docRef.current, box = wrap.current;
    if (!s || s.isCollapsed || !doc || !box || !doc.contains(s.anchorNode) || !doc.contains(s.focusNode)) {
      if (!composing) setSel(null);
      return;
    }
    const quote = s.toString().trim();
    if (!quote) return;
    const r = s.getRangeAt(0), rect = r.getBoundingClientRect(), b = box.getBoundingClientRect();
    setSel({ quote, x: rect.left - b.left + rect.width / 2, y: rect.bottom - b.top + 10, range: r.cloneRange() });
  };

  const post = () => {
    if (!sel || !draft.trim()) return;
    const id = Date.now();
    try {
      const mark = document.createElement('mark');
      mark.className = 'tm';
      sel.range.surroundContents(mark); // works when the selection is inside one element
    } catch { /* selection spans elements: still add the comment, skip the highlight */ }
    setComments((c) => [{ id, quote: sel.quote, body: draft.trim() }, ...c]);
    setSel(null); setComposing(false); setDraft('');
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="try" id="try">
      <div className="try-doc" ref={wrap} onMouseUp={onMouseUp}>
        <div className="try-bar"><b>$ /</b> opendocs <span>rollout-plan.html</span><em>Try it — select some text</em></div>
        <div className="try-page" ref={docRef} />
        {sel && !composing && (
          <button className="fbtn live" style={{ left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()} onClick={() => setComposing(true)}>💬 Comment</button>
        )}
        {sel && composing && (
          <div className="pop live" style={{ left: sel.x, top: sel.y }}>
            <div className="q">{sel.quote}</div>
            <textarea autoFocus value={draft} placeholder="Add a comment…" onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setComposing(false); setSel(null); } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }} />
            <div className="pop-actions"><span>⌘↵ to post</span>
              <button className="lnk" onClick={() => { setComposing(false); setSel(null); }}>Cancel</button>
              <button className="b" disabled={!draft.trim()} onClick={post}>Comment</button></div>
          </div>
        )}
      </div>
      <div className="try-rail">
        <div className="rail-h">Comments <span>{comments.length} open</span></div>
        {comments.length === 0 && <div className="rail-empty">Highlight a phrase in the document to leave a comment. Nothing here is saved.</div>}
        {comments.map((c) => (
          <div className="card" key={c.id}><div className="who"><b>You</b><span>just now</span></div><div className="quote">{c.quote}</div><p>{c.body}</p></div>
        ))}
      </div>
    </div>
  );
}
