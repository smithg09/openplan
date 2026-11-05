import React from 'react';

const FAQ: [string, React.ReactNode][] = [
  ['What is opendocs and how does it work?', 'opendocs is a review space for the HTML documents your agents produce. The agent publishes a self-contained HTML file, your team opens it and comments on the exact words, and the agent reads those comments and publishes the next version — all kept as one document with a full history.'],
  ['Who is it for?', 'Anyone whose team uses agents to write specs, plans, RCAs or reports — and everyone downstream who has to review them. Publishing needs an agent or the CLI; reviewing only needs a link.'],
  ['Do I need to be a developer?', 'To publish, someone runs a command (usually through an agent). To review, you just open a link, highlight text and comment — the same as any online doc.'],
  ['Which agents work with it?', 'Claude Code, Codex CLI and Antigravity have one-command skill installs (`opendocs install <agent>`). Any agent that can run shell commands can use the CLI directly. Copilot CLI isn’t supported yet.'],
  ['Where does my data live? Is it secure?', 'By default on your own machine (~/.opendocs). To share, you run the opendocs-proxy yourself. Documents render in a sandboxed iframe with no access to your comments or cookies; share links are capability tokens stored only as hashes, and live in the URL fragment so they never reach server logs. There’s no org SSO or SCIM yet.'],
  ['Is it free and open source?', 'Yes — MIT licensed, shipped as single Go binaries. No subscription, no vendor lock-in.'],
  ['How does it handle revisions?', 'Each publish adds an immutable version to the same document — same link, new version. Comments remember which version they were made on, and you can restore any old version as the new head.'],
  ['Do agents change documents on their own?', 'No. The agent responds to feedback your team already left, the way a person would after reading comments. Nothing is edited unprompted.'],
  ['What do I need to self-host?', 'A machine that can run one binary. SQLite is the default; Postgres is supported. Put a reverse proxy (or your host’s TLS) in front for HTTPS.'],
];

export default function Faq() {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <section className="sec" id="faq">
      <div className="wrap narrow">
        <h2 className="h2 c">Frequently asked questions</h2>
        <div className="faq">
          {FAQ.map(([q, a], i) => (
            <div className={`qa ${open === i ? 'open' : ''}`} key={q}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}><span>{q}</span><i>{open === i ? '−' : '+'}</i></button>
              {open === i && <p>{typeof a === 'string' ? a.split('`').map((p, k) => (k % 2 ? <code key={k}>{p}</code> : p)) : a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
