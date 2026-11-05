import React from 'react';
import { Icon } from '@openplan/annotations';
import Reveal from './Reveal';

/* ───────── 1. Local-first: a tree that visibly writes ───────── */
const TREE = [
  { d: 0, t: '~/.opendocs/docs/acme-billing/', k: 'dir' },
  { d: 1, t: 'checkout-latency-postmortem/', k: 'dir' },
  { d: 2, t: 'versions/7f3a9c41.html', k: 'new', n: 'v1  ·  written atomically' },
  { d: 2, t: 'versions/c01e44a2.html', k: 'new', n: 'v2  ·  content-addressed, immutable' },
  { d: 2, t: 'versions.json', k: 'file', n: 'parent chain + labels' },
  { d: 2, t: 'comments.json', k: 'file', n: 'threads, anchored to quotes' },
];

function LocalTile() {
  const [at, setAt] = React.useState(0);
  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAt(TREE.length); return; }
    const id = window.setInterval(() => setAt((v) => (v + 1) % (TREE.length + 3)), 1100);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="bt-tree" aria-label="Where documents are stored">
      {TREE.map((r, i) => (
        <div key={r.t} className={`bt-tr ${i < at ? 'on' : ''} ${r.k}`} style={{ paddingLeft: r.d * 20 }}>
          <Icon name={r.k === 'dir' ? 'folder' : 'description'} size={13} />
          <span>{r.t}</span>
          {r.n && <em>{r.n}</em>}
        </div>
      ))}
      <div className="bt-net"><span /> no network calls · nothing leaves this folder</div>
    </div>
  );
}

/* ───────── 2. Anchors: edit the sentence and watch the comment react ───────── */
type Edit = 'v2' | 'around' | 'rewrite';
const SENT: Record<Edit, { text: React.ReactNode; state: string; note: string }> = {
  v2: { text: <>We will <mark>run migrations through the online-schema tool only</mark>.</>, state: 'attached', note: 'Tomasz: “Only” is hard to enforce. A CI check is not.' },
  around: { text: <>From Q1, we will <mark>run migrations through the online-schema tool only</mark>, with no exceptions.</>, state: 're-attached', note: 'Words around the quote changed. The comment found its sentence again.' },
  rewrite: { text: <>Schema changes go through the online tool.</>, state: 'orphaned', note: 'The quoted words are gone. The comment is kept and flagged, not left pointing at the wrong place.' },
};

function AnchorTile() {
  const [e, setE] = React.useState<Edit>('v2');
  const s = SENT[e];
  return (
    <div className="bt-anchor">
      <p className="bt-sent" key={e}>{s.text}</p>
      <div className={`bt-cmt ${s.state}`} key={`${e}-c`}><b>{s.state}</b><span>{s.note}</span></div>
      <div className="bt-btns" role="group" aria-label="Edit the sentence">
        <button className={e === 'around' ? 'on' : ''} onClick={() => setE('around')}>Edit around it</button>
        <button className={e === 'rewrite' ? 'on' : ''} onClick={() => setE('rewrite')}>Rewrite it</button>
        <button onClick={() => setE('v2')} aria-label="Reset"><Icon name="undo" size={13} /></button>
      </div>
    </div>
  );
}

/* ───────── 3. Roles: pick one, see what the link can do ───────── */
const ROLES = ['Viewer', 'Commenter', 'Editor'] as const;
const CAPS: [string, number][] = [['Read the document and comments', 0], ['Comment, reply, react, resolve', 1], ['Edit or delete your own comments', 1], ['Publish and restore versions', 2], ['Create links, delete any comment', 2]];

function RoleTile() {
  const [r, setR] = React.useState(1);
  return (
    <div className="bt-roles">
      <div className="bt-seg" role="radiogroup" aria-label="Link role">
        {ROLES.map((n, i) => <button key={n} role="radio" aria-checked={r === i} className={r === i ? 'on' : ''} onClick={() => setR(i)}>{n}</button>)}
      </div>
      <ul>
        {CAPS.map(([c, need]) => (
          <li key={c} className={r >= need ? 'yes' : 'no'}><Icon name={r >= need ? 'check' : 'close'} size={13} /><span>{c}</span></li>
        ))}
      </ul>
      <div className="bt-link"><code>docs.northwind.dev/d/9c41e0b7<mark>#t=•••••••••••</mark></code><em>The token after # is never sent to a server.</em></div>
    </div>
  );
}

/* ───────── 4. Versions: scrub through history ───────── */
const VERS = [
  { v: 'v1', s: 'Initial version', lines: [['', 'Retries: three immediate attempts per call.'], ['', 'Rota: weekday business hours.'], ['', '6.2% of sessions abandoned the cart.']] },
  { v: 'v2', s: 'Moved rota change to 1 December', lines: [['', 'Retries: three immediate attempts per call.'], ['-', 'Rota: weekday business hours.'], ['+', 'Rota: follow-the-sun from 1 December.'], ['', '6.2% of sessions abandoned the cart.']] },
  { v: 'v3', s: 'Added CI dry-run gate', lines: [['-', 'Retries: three immediate attempts per call.'], ['+', 'Retries: two, with jittered backoff and a 10% budget.'], ['', 'Rota: follow-the-sun from 1 December.'], ['', '6.2% of sessions abandoned the cart.']] },
  { v: 'v4', s: 'Clarified abandonment base', lines: [['', 'Retries: two, with jittered backoff and a 10% budget.'], ['', 'Rota: follow-the-sun from 1 December.'], ['-', '6.2% of sessions abandoned the cart.'], ['+', '6.2% of sessions that reached payment abandoned the cart.']] },
];

function VersionTile() {
  const [i, setI] = React.useState(3);
  const v = VERS[i];
  return (
    <div className="bt-vers">
      <div className="bt-vhead"><b>{v.v}</b><span>{v.s}</span>{i === VERS.length - 1 && <em>latest</em>}</div>
      <div className="bt-diff" key={v.v}>
        {v.lines.map(([k, t], n) => <div key={n} className={`ln ${k === '+' ? 'add' : k === '-' ? 'del' : ''}`}><i>{k || ' '}</i><span>{t}</span></div>)}
      </div>
      <input className="bt-range" type="range" min={0} max={VERS.length - 1} step={1} value={i} onChange={(e) => setI(+e.target.value)} aria-label="Version" />
      <div className="bt-ticks">{VERS.map((x, n) => <button key={x.v} className={n === i ? 'on' : ''} onClick={() => setI(n)}>{x.v}</button>)}</div>
    </div>
  );
}

/* ───────── 5. Search: the real query language, live ───────── */
const CORPUS = [
  { t: 'checkout-latency-postmortem', x: 'Cap payment retries at two attempts with jittered backoff. Run migrations through the online-schema tool.' },
  { t: 'q3-launch-plan', x: 'Beta ships on 12 September to 500 design-partner accounts. Support coverage is business hours only. Draft.' },
  { t: 'eu-data-residency-memo', x: 'Legal sign-off is outstanding for the residency clause. Retries must not cross regions.' },
  { t: 'onboarding-redesign', x: 'Reduce the signup form to three fields. Draft copy for the empty state is in review.' },
  { t: 'pricing-experiment-readout', x: 'Two tiers outperformed three. Retry the experiment in the EU before rolling out.' },
];

function parse(q: string) {
  const words: string[] = [], phrases: string[] = [], not: string[] = [];
  const re = /"([^"]+)"|(-?\S+)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    if (m[1]) phrases.push(m[1].toLowerCase());
    else if (m[2].startsWith('-') && m[2].length > 1) not.push(m[2].slice(1).toLowerCase());
    else words.push(m[2].toLowerCase());
  }
  return { words, phrases, not };
}
const hasWord = (h: string, w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(h);

function SearchTile() {
  const [q, setQ] = React.useState('retries -draft');
  const { words, phrases, not } = parse(q);
  const hits = CORPUS.filter((d) => {
    const h = `${d.t.replace(/-/g, ' ')} ${d.x}`.toLowerCase();
    return (words.length + phrases.length > 0) && words.every((w) => hasWord(h, w)) && phrases.every((p) => h.includes(p)) && not.every((n) => !hasWord(h, n));
  });
  return (
    <div className="bt-search">
      <label className="bt-q"><span>$ opendocs search</span><input value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} aria-label="Search query" /></label>
      <div className="bt-chips">{['retries -draft', '"business hours"', 'retry', 'legal -memo'].map((c) => <button key={c} onClick={() => setQ(c)} className={q === c ? 'on' : ''}>{c}</button>)}</div>
      <ul className="bt-hits">
        {hits.length === 0 && <li className="none">No matches. Every word must appear; <code>-word</code> excludes.</li>}
        {hits.map((d) => <li key={d.t}><b>{d.t}</b><span>{d.x}</span></li>)}
      </ul>
    </div>
  );
}

export default function Features() {
  return (
    <section className="ps bt-sec" id="features">
      <div className="wrap">
        <Reveal>
          <div className="bt-head">
            <div className="slabel">Built for how teams actually review</div>
            <h2 className="stitle">Five things you can poke at</h2>
            <p className="ssub">None of these are screenshots. Each tile below is a small working version of the real behaviour.</p>
          </div>
        </Reveal>

        <div className="bt">
          <Reveal i={0} className="bt-c7"><article className="bt-tile">
            <header><span className="bt-k">Local-first</span><h3>Your documents stay where you wrote them</h3><p>Versions are plain files: content-addressed, immutable, written atomically. Nothing is uploaded until you decide to share.</p></header>
            <LocalTile />
          </article></Reveal>

          <Reveal i={1} className="bt-c5"><article className="bt-tile tone">
            <header><span className="bt-k">Sharing</span><h3>One link, one role</h3><p>No accounts. Pick a role to see what that link can do.</p></header>
            <RoleTile />
          </article></Reveal>

          <Reveal i={2} className="bt-c5"><article className="bt-tile">
            <header><span className="bt-k">Comments that stay put</span><h3>Anchored to words, not pixels</h3><p>Edit the sentence and watch what happens to its comment.</p></header>
            <AnchorTile />
          </article></Reveal>

          <Reveal i={3} className="bt-c7"><article className="bt-tile tone">
            <header><span className="bt-k">Versions</span><h3>Every revision kept, scrub through them</h3><p>Open any version to see exactly what reviewers saw, or restore an old one as the new head.</p></header>
            <VersionTile />
          </article></Reveal>

          <Reveal i={4} className="bt-c12"><article className="bt-tile wide">
            <header><span className="bt-k">Search and export</span><h3>Find it, take it, leave with it</h3><p>Full-text search with the same query language agents use. Comments export as Markdown or JSON; the original HTML downloads untouched; print-to-PDF follows your theme.</p></header>
            <SearchTile />
          </article></Reveal>
        </div>
      </div>
    </section>
  );
}
