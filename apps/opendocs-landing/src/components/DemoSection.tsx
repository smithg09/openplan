import React from 'react';
import { AnnoCard } from '@openplan/annotations';
import { SelectionToolbar, CommentPopover, SuggestionPopover } from '@openplan/toolbar';
import type { Annotation, AnnotationType } from '@openplan/shared';

// A working miniature of the real review UI, built from the same components the
// app uses (selection toolbar, comment popover, comment cards). Select any text.

interface Block { tag: 'h1' | 'h2' | 'p'; text: string }
const DOC: Block[] = [
  { tag: 'h1', text: 'Postmortem: checkout latency, 14 October' },
  { tag: 'p', text: 'Between 21:08 and 22:41 UTC, p95 checkout latency rose from 410 ms to 3.9 s. 6.2% of sessions abandoned the cart, against a usual 1.8%.' },
  { tag: 'h2', text: 'What happened' },
  { tag: 'p', text: 'A schema migration on the orders table held a lock for 11 minutes. Payment authorisations queued behind it, and the retry policy tripled the load once the lock released.' },
  { tag: 'h2', text: 'What we are changing' },
  { tag: 'p', text: 'We will run migrations through the online-schema tool only, and cap payment retries at two attempts with jittered backoff.' },
  { tag: 'p', text: 'The on-call rota moves to a follow-the-sun pattern from 1 December.' },
];

interface Reply { id: string; author: string; body: string; createdAt: string }
interface Note {
  id: string; p: number; start: number; end: number; quote: string;
  type: AnnotationType; body: string; suggestion?: string; author: string; createdAt: string;
  resolved: boolean; replies: Reply[]; reactions: Record<string, string[]>; // emoji -> authors
}

const ME = 'You';
const ago = (m: number) => new Date(Date.now() - m * 60000).toISOString();

const loc = (p: number, quote: string) => { const start = DOC[p].text.indexOf(quote); return { p, start, end: start + quote.length, quote }; };

const seed = (): Note[] => [
  { id: 'n1', ...loc(1, '6.2% of sessions abandoned the cart'), type: 'question', author: 'Wanjiru Kamau', createdAt: ago(52), resolved: false, replies: [], reactions: {},
    body: 'Is that against all sessions, or only those that reached payment? Finance will ask.' },
  { id: 'n2', ...loc(5, 'run migrations through the online-schema tool only'), type: 'suggestion', author: 'Tomasz Brandt', createdAt: ago(31), resolved: false, replies: [], reactions: {},
    body: '“Only” is hard to enforce. A CI check is not.', suggestion: 'block any migration touching orders unless CI has a dry run on a production-sized replica' },
  { id: 'n3', ...loc(6, 'follow-the-sun'), type: 'comment', author: 'Ife Adeyemi', createdAt: ago(12), resolved: false, reactions: { '👍': ['Wanjiru Kamau', 'Tomasz Brandt'] },
    body: 'Do we have the APAC headcount for this by December?',
    replies: [{ id: 'r1', author: 'Wanjiru Kamau', body: 'Two hires are approved; the first starts on 3 November.', createdAt: ago(6) }] },
];

const COLORS: Record<string, string> = { comment: 'var(--comment)', question: 'var(--question)', suggestion: 'var(--teal)', deletion: 'var(--danger)', emoji: 'var(--text-muted)' };

function toAnno(n: Note): Annotation {
  return {
    id: n.id, type: n.type, selectedText: n.quote, from: n.start, to: n.end, body: n.body, suggestion: n.suggestion,
    author: n.author, createdAt: n.createdAt, resolved: n.resolved,
    replies: n.replies.map((r) => ({ id: r.id, body: r.body, author: r.author, createdAt: r.createdAt, reactions: [] })),
    reactions: Object.entries(n.reactions).map(([emoji, who]) => ({ emoji, count: who.length, reactedByMe: who.includes(ME), reactors: who })),
  };
}

type Sel = { p: number; start: number; end: number; quote: string; x: number; y: number };

export default function DemoSection() {
  const [notes, setNotes] = React.useState<Note[]>(seed);
  const [sel, setSel] = React.useState<Sel | null>(null);
  const [composer, setComposer] = React.useState<null | 'comment' | 'question' | 'suggestion'>(null);
  const [focus, setFocus] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<string | null>(null);
  const [tops, setTops] = React.useState<Record<string, number>>({});
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const docRef = React.useRef<HTMLDivElement>(null);
  const marks = React.useRef<Record<string, HTMLElement | null>>({});
  const cards = React.useRef<Record<string, HTMLDivElement | null>>({});

  // Measure where each highlight sits and how tall each card is.
  React.useLayoutEffect(() => {
    const next: Record<string, number> = {};
    for (const n of notes) { const m = marks.current[n.id]; if (m) next[n.id] = m.offsetTop; }
    setTops((t) => (JSON.stringify(t) === JSON.stringify(next) ? t : next));
    const h: Record<string, number> = {};
    for (const n of notes) { const c = cards.current[n.id]; if (c) h[n.id] = c.offsetHeight; }
    setHeights((o) => (JSON.stringify(o) === JSON.stringify(h) ? o : h));
  });

  const laidOut = React.useMemo(() => {
    const order = [...notes].sort((a, b) => (tops[a.id] ?? 0) - (tops[b.id] ?? 0));
    const out: Record<string, number> = {};
    let cursor = -Infinity;
    for (const n of order) {
      let top = (tops[n.id] ?? 0) - 4;
      if (cursor !== -Infinity && top < cursor + 10) top = cursor + 10;
      out[n.id] = top;
      cursor = top + (heights[n.id] ?? 110);
    }
    return { out, end: cursor === -Infinity ? 0 : cursor };
  }, [notes, tops, heights]);

  const onMouseUp = () => {
    const s = window.getSelection();
    const doc = docRef.current;
    if (!s || s.isCollapsed || !doc || s.rangeCount === 0) { if (!composer) setSel(null); return; }
    const range = s.getRangeAt(0);
    const startEl = (range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer as Element)?.closest('[data-p]');
    const endEl = (range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer as Element)?.closest('[data-p]');
    if (!startEl || startEl !== endEl || !doc.contains(startEl)) { if (!composer) setSel(null); return; }
    const quote = s.toString().replace(/\s+/g, ' ').trim();
    if (!quote) return;
    const pre = document.createRange();
    pre.setStart(startEl, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + s.toString().length;
    const rect = range.getBoundingClientRect();
    setSel({ p: Number((startEl as HTMLElement).dataset.p), start, end, quote, x: rect.left + rect.width / 2, y: rect.top });
  };

  const add = (type: AnnotationType, body: string, suggestion?: string) => {
    if (!sel) return;
    const n: Note = { id: `n${Date.now()}`, p: sel.p, start: sel.start, end: sel.end, quote: sel.quote, type, body, suggestion, author: ME, createdAt: new Date().toISOString(), resolved: false, replies: [], reactions: {} };
    setNotes((l) => [...l, n]);
    setSel(null); setComposer(null); setFocus(n.id);
    window.getSelection()?.removeAllRanges();
  };
  const onToolbar = (type: string, meta?: { emoji?: string }) => {
    if (type === 'comment' || type === 'question' || type === 'suggestion') setComposer(type);
    else if (type === 'deletion') add('deletion', '');
    else if (type === 'emoji' && meta?.emoji) add('emoji', meta.emoji);
  };
  const patch = (id: string, f: (n: Note) => Note) => setNotes((l) => l.map((n) => (n.id === id ? f(n) : n)));

  // Render a paragraph with its highlights.
  const renderBlock = (b: Block, i: number) => {
    const mine = notes.filter((n) => n.p === i && n.end <= b.text.length).sort((a, c) => a.start - c.start);
    const parts: React.ReactNode[] = [];
    let at = 0;
    for (const n of mine) {
      if (n.start < at) continue; // overlapping: skip highlight, keep the comment
      if (n.start > at) parts.push(b.text.slice(at, n.start));
      parts.push(
        <mark key={n.id} ref={(el) => { marks.current[n.id] = el; }} className={`dm-hl t-${n.type} ${n.resolved ? 'is-done' : ''} ${focus === n.id ? 'is-focus' : ''}`}
          style={{ ['--hl' as string]: COLORS[n.type] }} onClick={() => setFocus(n.id)}>{b.text.slice(n.start, n.end)}</mark>,
      );
      at = n.end;
    }
    if (at < b.text.length) parts.push(b.text.slice(at));
    const Tag = b.tag;
    return <Tag key={i} data-p={i} className="dm-block">{parts}</Tag>;
  };

  const open = notes.filter((n) => !n.resolved).length;
  const popPos = sel ? { x: Math.max(12, Math.min(sel.x - 160, window.innerWidth - 340)), y: Math.min(sel.y + 34, window.innerHeight - 260) } : null;
  const barPos = sel ? { x: Math.max(8, sel.x - 86), y: sel.y > 70 ? sel.y - 46 : sel.y + 28 } : null;

  return (
    <section className="lp-demo-section" id="demo">
      <div className="wrap">
        <div className="sc">
          <div className="slabel">Try it</div>
          <h2 className="stitle">Review the way your team will</h2>
          <p className="ssub">This is a real incident postmortem an agent wrote. Select any words: comment, ask, suggest a rewrite, strike it, or react. Cards stay level with the text.</p>
        </div>

        <div className="dw">
          <div className="dtb">
            <span className="tbd" style={{ background: '#ff5f57' }} /><span className="tbd" style={{ background: '#febc2e' }} /><span className="tbd" style={{ background: '#28c840' }} />
            <span className="tbt"><b style={{ color: 'var(--accent-fg)' }}>$ /</b> opendocs / checkout-latency-postmortem.html</span>
            <span className="tbp">v2 · {open} open</span>
          </div>
          <div className="dm-main">
            <div className="dm-doc" ref={docRef} onMouseUp={onMouseUp}>{DOC.map(renderBlock)}</div>
            <div className="dm-rail">
              <div className="dm-track" style={{ height: Math.max(laidOut.end + 24, 300) }}>
                {notes.length === 0 && <div className="dm-empty">No comments left. Select text in the document to start one.</div>}
                {notes.map((n) => {
                  const expanded = focus === n.id || hover === n.id;
                  return (
                    <div key={n.id} ref={(el) => { cards.current[n.id] = el; }} className="dm-card" style={{ top: Math.round(laidOut.out[n.id] ?? 0), zIndex: expanded ? 3 : 1 }}
                      onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}>
                      <AnnoCard
                        anno={toAnno(n)} isFocus={focus === n.id} expanded={expanded}
                        onClick={() => { setFocus(n.id); marks.current[n.id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}
                        onEdit={n.author === ME ? (id, body) => patch(id, (x) => ({ ...x, body })) : undefined}
                        onRemove={() => setNotes((l) => l.filter((x) => x.id !== n.id))}
                        onResolve={(id) => patch(id, (x) => ({ ...x, resolved: !x.resolved }))}
                        onReply={(id, body) => patch(id, (x) => ({ ...x, replies: [...x.replies, { id: `r${Date.now()}`, author: ME, body, createdAt: new Date().toISOString() }] }))}
                        onReact={(id, emoji) => patch(id, (x) => {
                          const who = x.reactions[emoji] ?? [];
                          const next = who.includes(ME) ? who.filter((w) => w !== ME) : [...who, ME];
                          const reactions = { ...x.reactions };
                          if (next.length) reactions[emoji] = next; else delete reactions[emoji];
                          return { ...x, reactions };
                        })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {sel && barPos && !composer && <SelectionToolbar pos={barPos} onAction={onToolbar} />}
      {sel && popPos && composer === 'suggestion' && <SuggestionPopover pos={popPos} quote={sel.quote} onCancel={() => { setComposer(null); setSel(null); }} onSave={(body, s) => add('suggestion', body, s)} />}
      {sel && popPos && (composer === 'comment' || composer === 'question') && <CommentPopover pos={popPos} type={composer} quote={sel.quote} onCancel={() => { setComposer(null); setSel(null); }} onSave={(body) => add(composer, body)} />}
    </section>
  );
}
