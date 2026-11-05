import React from 'react';
import { SiteSwitcher } from '@openplan/shared';

const INSTALL = 'curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash -s opendocs';
const REPO = 'https://github.com/smithg09/openplan';

function CopyCmd({ cmd }: { cmd: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      className="cmd"
      onClick={() => {
        void navigator.clipboard?.writeText(cmd).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); });
      }}
      title="Copy"
    >
      <span className="cmd-p">$</span>
      <code>{cmd}</code>
      <span className="cmd-copy">{done ? 'copied' : 'copy'}</span>
    </button>
  );
}

function Nav({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <nav>
      <div className="ni">
        <SiteSwitcher current="opendocs" />
        <div className="ns" />
        <button className="thm" onClick={onToggle} title="Toggle theme" aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <a className="nlink" href={REPO} target="_blank" rel="noreferrer">GitHub</a>
        <a className="ncta" href="#install">Install →</a>
      </div>
    </nav>
  );
}

/** A static mock of the review UI: the doc on the left, the comment rail on the right. */
function Mock() {
  return (
    <div className="mock" aria-hidden="true">
      <div className="mock-bar"><i /><i /><i /><span>opendocs · q3-launch-plan</span><b>EDITOR</b></div>
      <div className="mock-body">
        <div className="mock-doc">
          <h4>Q3 launch plan</h4>
          <p>We ship the beta on <mark>September 12 to 500 design-partner accounts</mark>, with a staged rollout behind a flag.</p>
          <p>Support coverage is <mark className="m2">business hours only</mark> until the on-call rota is staffed.</p>
          <p className="faint">Risks, owners and the rollback plan follow in section 4…</p>
        </div>
        <div className="mock-rail">
          <div className="mock-card">
            <div className="q">September 12 to 500 design-partner accounts</div>
            <p><b>Priya</b> Can we confirm legal sign-off before this date?</p>
            <p className="reply"><b>Agent</b> Added a sign-off gate in v3 →</p>
          </div>
          <div className="mock-card done">
            <div className="q">business hours only</div>
            <p><b>Sam</b> 👍 resolved</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { n: '1', t: 'Agent publishes HTML', d: 'Reports, specs, dashboards, diagrams — one self-contained file. `opendocs open report.html` snapshots it and opens the review UI.' },
  { n: '2', t: 'You comment on the exact words', d: 'Select text, leave a comment. Anchors are quote-based, so they survive the next version — or flag themselves as orphaned.' },
  { n: '3', t: 'Agent reads it and ships v2', d: '`opendocs review` blocks until you hit Submit, then prints your open threads as JSON. No polling. Every version is kept.' },
];

const FEATURES = [
  ['Local-first', 'Everything lives in ~/.opendocs. No account, no server, nothing leaves your machine unless you share it.'],
  ['Safe rendering', 'Agent HTML runs in an opaque-origin sandboxed iframe. It can’t touch your comments, cookies or the API.'],
  ['Every version kept', 'Content-addressed, immutable snapshots with a parent chain, optimistic concurrency, and one-click restore.'],
  ['A blocking review loop', '`opendocs review` returns structured comments on stdout the moment you submit. Built for agents, not dashboards.'],
  ['Share by capability link', 'Viewer, commenter or editor links. No accounts: the token lives in the URL fragment and only its hash is stored.'],
  ['Self-host or hosted', 'One Go binary with SQLite or Postgres — or use the hosted instance. Same UI, same API, your choice.'],
];

const ROLES = [
  ['Read the doc and comments', true, true, true],
  ['Comment, reply, react, resolve', false, true, true],
  ['Edit / delete own comments', false, true, true],
  ['Publish & restore versions', false, false, true],
  ['Delete any comment, mint links', false, false, true],
] as const;

export default function App() {
  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '');
  };

  return (
    <>
      <Nav theme={theme} onToggle={toggle} />
      <header className="hero">
        <div className="wrap">
          <p className="eyebrow">Review the HTML your agent writes</p>
          <h1>Comment on the exact words.<br /><span className="grad">Every version kept.</span></h1>
          <p className="lede">
            Agents publish self-contained HTML. You highlight, comment and resolve in the browser.
            The agent reads your threads and publishes the next version. Local-first, with an optional proxy to share.
          </p>
          <CopyCmd cmd={INSTALL} />
          <p className="sub">macOS &amp; Linux · single Go binary · <a href={REPO}>MIT</a></p>
          <Mock />
        </div>
      </header>

      <section className="sec">
        <div className="wrap">
          <h2>How it works</h2>
          <div className="steps">
            {STEPS.map((s) => (
              <div className="step" key={s.n}>
                <span className="num">{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d.split('`').map((p, i) => (i % 2 ? <code key={i}>{p}</code> : p))}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec alt">
        <div className="wrap">
          <h2>Built for the agent loop</h2>
          <div className="grid">
            {FEATURES.map(([t, d]) => (
              <div className="feat" key={t}>
                <h3>{t}</h3>
                <p>{d.split('`').map((p, i) => (i % 2 ? <code key={i}>{p}</code> : p))}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap narrow">
          <h2>Share with exactly the right power</h2>
          <p className="muted">Each link carries one role. Revoke it any time.</p>
          <table className="roles">
            <thead><tr><th /><th>Viewer</th><th>Commenter</th><th>Editor</th></tr></thead>
            <tbody>
              {ROLES.map(([label, v, c, e]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {[v, c, e].map((on, i) => <td key={i} className={on ? 'yes' : 'no'}>{on ? '✓' : '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec alt" id="install">
        <div className="wrap narrow">
          <h2>Install</h2>
          <p className="muted">Pick what you need. All three come from the same installer.</p>
          <div className="installs">
            <div><h3>opendocs</h3><p>The local review app and CLI.</p><CopyCmd cmd={INSTALL} /></div>
            <div><h3>opendocs-proxy</h3><p>Self-host sharing with SQLite or Postgres.</p>
              <CopyCmd cmd="curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash -s opendocs-proxy" /></div>
          </div>
          <p className="sub">Using Claude Code plans instead? That’s <a href="https://openplan.smithgajjar.dev">openplan</a>.</p>
        </div>
      </section>

      <footer>
        <div className="wrap foot">
          <span>© {new Date().getFullYear()} opendocs · part of <a href="https://openplan.smithgajjar.dev">openplan</a></span>
          <span><a href={REPO}>GitHub</a></span>
        </div>
      </footer>
    </>
  );
}
