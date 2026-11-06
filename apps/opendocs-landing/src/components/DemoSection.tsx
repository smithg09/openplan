import React from 'react';
import { AnnoCard, Icon } from '@openplan/annotations';
import { SelectionToolbar, CommentPopover, SuggestionPopover } from '@openplan/toolbar';
import type { Annotation, AnnotationType } from '@openplan/shared';
// The demo runs the REAL pieces: the same bridge script the app injects, the same
// highlight stylesheet, and the sample document `opendocs demo` ships.
import bridgeJS from '../../../cli/internal/opendocs/render/bridge.js?raw';
import bridgeCSS from '../../../cli/internal/opendocs/render/bridge.css?raw';
import sampleHTML from '../../../cli/internal/opendocs/sample/retry-storm.html?raw';

interface Anchor { quote: string; prefix?: string; suffix?: string; start?: number; end?: number }
interface Reply { id: string; author: string; body: string; createdAt: string }
interface Note {
  id: string; anchor: Anchor; type: AnnotationType; body: string; suggestion?: string; author: string; createdAt: string;
  resolved: boolean; replies: Reply[]; reactions: Record<string, string[]>;
}
type Rect = { top: number; left: number; width: number; height: number };

const ME = 'You';
const ago = (m: number) => new Date(Date.now() - m * 60000).toISOString();

const SEED: Note[] = [
  { id: 'n1', anchor: { quote: 'because our clients tried to be helpful' }, type: 'suggestion', author: 'Tomasz Brandt', createdAt: ago(30), resolved: false, replies: [], reactions: {},
    body: 'The clients did what we told them to. Say so.', suggestion: 'because our retry policy told every client to try again at once' },
  { id: 'n2', anchor: { quote: 'of sessions abandoned the cart' }, type: 'question', author: 'Wanjiru Kamau', createdAt: ago(48), resolved: false, replies: [], reactions: {},
    body: 'Is that against all sessions, or only those that reached payment? Finance will ask.' },
  { id: 'n3', anchor: { quote: 'three attempts with no delay between them' }, type: 'comment', author: 'Ife Adeyemi', createdAt: ago(11), resolved: false, reactions: { '👍': ['Wanjiru Kamau', 'Tomasz Brandt'] },
    body: 'Was that the default, or did someone set it? I want it in the actions.',
    replies: [{ id: 'r1', author: 'Wanjiru Kamau', body: 'It was the default in the shared client library since 2022.', createdAt: ago(6) }] },
];

/** Same injection the Go server does (render.Frame). */
function buildFrame(html: string): string {
  const inject = `<style id="opendocs-bridge-style">${bridgeCSS}</style><script>${bridgeJS}</script>`;
  const m = /<head[\s>]/i.exec(html);
  if (!m) return inject + html;
  const end = html.indexOf('>', m.index);
  return html.slice(0, end + 1) + inject + html.slice(end + 1);
}

function toAnno(n: Note): Annotation {
  return {
    id: n.id, type: n.type, selectedText: n.anchor.quote, from: 0, to: 0, body: n.body, suggestion: n.suggestion,
    author: n.author, createdAt: n.createdAt, resolved: n.resolved,
    replies: n.replies.map((r) => ({ id: r.id, body: r.body, author: r.author, createdAt: r.createdAt, reactions: [] })),
    reactions: Object.entries(n.reactions).map(([emoji, who]) => ({ emoji, count: who.length, reactedByMe: who.includes(ME), reactors: who })),
  };
}

export default function DemoSection({ theme }: { theme: 'dark' | 'light' }) {
  const [notes, setNotes] = React.useState<Note[]>(SEED);
  const [sel, setSel] = React.useState<{ anchor: Anchor; rect: Rect } | null>(null);
  const [composer, setComposer] = React.useState<null | 'comment' | 'question' | 'suggestion'>(null);
  const [focus, setFocus] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<string | null>(null);
  const [layout, setLayout] = React.useState({ scrollTop: 0, scrollHeight: 0, anchors: {} as Record<string, number> });
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const frame = React.useRef<HTMLIFrameElement>(null);
  const box = React.useRef<HTMLDivElement>(null);
  const cards = React.useRef<Record<string, HTMLDivElement | null>>({});
  const notesRef = React.useRef(notes); notesRef.current = notes;
  const themeRef = React.useRef(theme); themeRef.current = theme;
  const composerRef = React.useRef(composer); composerRef.current = composer;
  const srcDoc = React.useMemo(() => buildFrame(sampleHTML), []);

  const post = React.useCallback((m: unknown) => frame.current?.contentWindow?.postMessage(m, '*'), []);
  const paint = React.useCallback((list: Note[]) => post({ type: 'opendocs:paint', anchors: list.map((n) => ({ id: n.id, anchor: n.anchor, status: n.resolved ? 'resolved' : 'open', type: n.type })) }), [post]);

  React.useEffect(() => { post({ type: 'opendocs:theme', theme }); }, [theme, post]);
  React.useEffect(() => { paint(notes); }, [notes, paint]);

  React.useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== frame.current?.contentWindow) return;
      const m = ev.data;
      if (!m || typeof m.type !== 'string') return;
      if (m.type === 'opendocs:ready') { post({ type: 'opendocs:theme', theme: themeRef.current }); paint(notesRef.current); }
      else if (m.type === 'opendocs:selection') setSel({ anchor: m.anchor, rect: m.rect });
      else if (m.type === 'opendocs:selection-cleared') { if (!composerRef.current) setSel(null); }
      else if (m.type === 'opendocs:activate') setFocus(m.id);
      else if (m.type === 'opendocs:scroll') setLayout((l) => ({ ...l, scrollTop: m.scrollTop }));
      else if (m.type === 'opendocs:layout') setLayout({ scrollTop: m.scrollTop, scrollHeight: m.scrollHeight, anchors: m.anchors });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [post, paint]);

  React.useLayoutEffect(() => {
    const h: Record<string, number> = {};
    for (const n of notes) { const c = cards.current[n.id]; if (c) h[n.id] = c.offsetHeight; }
    setHeights((o) => (JSON.stringify(o) === JSON.stringify(h) ? o : h));
  });

  const tops = React.useMemo(() => {
    const ordered = [...notes].sort((a, b) => (layout.anchors[a.id] ?? 1e9) - (layout.anchors[b.id] ?? 1e9));
    const out: Record<string, number> = {};
    let cursor = -Infinity;
    for (const n of ordered) {
      let top = (layout.anchors[n.id] ?? 0) - 6;
      if (cursor !== -Infinity && top < cursor + 10) top = cursor + 10;
      out[n.id] = top;
      cursor = top + (heights[n.id] ?? 110);
    }
    return out;
  }, [notes, layout.anchors, heights]);

  const add = (type: AnnotationType, body: string, suggestion?: string) => {
    if (!sel) return;
    const n: Note = { id: `n${Date.now()}`, anchor: sel.anchor, type, body, suggestion, author: ME, createdAt: new Date().toISOString(), resolved: false, replies: [], reactions: {} };
    setNotes((l) => [...l, n]); setSel(null); setComposer(null); setFocus(n.id);
  };
  const onToolbar = (type: string, meta?: { emoji?: string }) => {
    if (type === 'comment' || type === 'question' || type === 'suggestion') setComposer(type);
    else if (type === 'deletion') add('deletion', '');
    else if (type === 'emoji' && meta?.emoji) add('emoji', meta.emoji);
  };
  const patch = (id: string, f: (n: Note) => Note) => setNotes((l) => l.map((n) => (n.id === id ? f(n) : n)));

  // Floating UI in viewport coordinates: iframe origin + selection rect.
  const fr = frame.current?.getBoundingClientRect();
  const bar = sel && fr && sel.rect.top > -10 && sel.rect.top < fr.height ? { x: fr.left + sel.rect.left + sel.rect.width / 2 - 86, y: fr.top + sel.rect.top - 46 } : null;
  const pop = sel && fr ? { x: Math.max(12, Math.min(fr.left + sel.rect.left + sel.rect.width / 2 - 160, window.innerWidth - 340)), y: Math.min(fr.top + sel.rect.top + sel.rect.height + 12, window.innerHeight - 260) } : null;
  const open = notes.filter((n) => !n.resolved).length;

  return (
    <section className="lp-demo-section" id="demo">
      <div className="wrap">
        <div className="sc">
          <div className="slabel">Try it</div>
          <h2 className="stitle">A real interactive document, reviewed the real way</h2>
          <p className="ssub">This is the sample document that ships with <code>opendocs demo</code>: a live chart you can drag, a checklist and tabs. Select any words to comment, ask or suggest — your cards stay level with the text.</p>
        </div>

        <div className="dw" ref={box}>
          <div className="dtb">
            <span className="tbd" style={{ background: '#ff5f57' }} /><span className="tbd" style={{ background: '#febc2e' }} /><span className="tbd" style={{ background: '#28c840' }} />
            <span className="tbt"><b style={{ color: 'var(--accent-fg)' }}>$ /</b> opendocs / retry-storm</span>
            <span className="tbp">v3 · {open} open</span>
          </div>
          <div className="dm-main">
            <iframe ref={frame} className="dm-frame" title="Sample document" sandbox="allow-scripts" srcDoc={srcDoc} />
            <div className="dm-rail">
              <div className="dm-rail-head"><b>Comments</b><span>{open}</span></div>
              <div className="dm-rail-view">
                <div className="dm-track" style={{ transform: `translateY(${-layout.scrollTop - 38}px)` }}>
                  {notes.map((n) => {
                    const expanded = focus === n.id || hover === n.id;
                    return (
                      <div key={n.id} ref={(el) => { cards.current[n.id] = el; }} className="dm-card" style={{ top: Math.round(tops[n.id] ?? 0), zIndex: expanded ? 3 : 1 }}
                        onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}>
                        <AnnoCard
                          anno={toAnno(n)} isFocus={focus === n.id} expanded={expanded}
                          onClick={() => { setFocus(n.id); post({ type: 'opendocs:scroll-to', id: n.id }); }}
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
                {notes.length === 0 && <div className="dm-empty"><Icon name="chat_bubble" size={20} /><br />No comments left. Select text in the document to start one.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {sel && bar && !composer && <SelectionToolbar pos={bar} onAction={onToolbar} />}
      {sel && pop && composer === 'suggestion' && <SuggestionPopover pos={pop} quote={sel.anchor.quote} onCancel={() => { setComposer(null); setSel(null); }} onSave={(b, s) => add('suggestion', b, s)} />}
      {sel && pop && (composer === 'comment' || composer === 'question') && <CommentPopover pos={pop} type={composer} quote={sel.anchor.quote} onCancel={() => { setComposer(null); setSel(null); }} onSave={(b) => add(composer, b)} />}
    </section>
  );
}
