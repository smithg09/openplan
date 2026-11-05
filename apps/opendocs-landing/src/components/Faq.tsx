import React from 'react';
import Reveal from './Reveal';

const FAQ: [string, string][] = [
  ['What is opendocs?', 'A review space for the HTML documents your agents produce. The agent publishes a self-contained HTML file, your team comments on exact sentences, and the agent reads the comments and publishes the next version — one document, full history.'],
  ['Who is it for?', 'Teams whose agents write specs, plans, postmortems and reports, and the people who review them. Publishing takes an agent or the CLI; reviewing takes a link and a highlighter.'],
  ['Which agents work with it?', 'Claude Code, Codex and Antigravity have one-command installs (opendocs install <agent>). Any agent that can run shell commands can use the CLI. Copilot CLI is not supported yet.'],
  ['Where does my data live?', 'On your machine by default. To share, you run opendocs-proxy yourself (SQLite or Postgres). Documents render in a sandboxed iframe that cannot read your comments or cookies; link tokens are stored only as hashes.'],
  ['Is there org-wide access control?', 'Not yet. Access is per-document by capability link (viewer, commenter, editor). There is no SSO or SCIM.'],
  ['Is it free?', 'Yes. MIT licensed, shipped as single binaries. No subscription.'],
  ['Do agents change documents on their own?', 'No. The agent responds to feedback your team already left, the way a person would after reading comments.'],
  ['What do I need to self-host?', 'Somewhere to run one binary. SQLite is the default, Postgres is supported, and you put your own TLS in front.'],
];

export default function Faq() {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <section className="ps fq-sec" id="faq">
      <div className="wrap fq-grid">
        <Reveal>
          <div className="fq-aside">
            <div className="slabel">FAQ</div>
            <h2 className="stitle">Questions, answered plainly</h2>
            <p className="ssub">Anything missing? Open an issue and it goes here.</p>
            <a className="fq-link" href="https://github.com/smithg09/openplan/issues" target="_blank" rel="noreferrer">Ask on GitHub</a>
          </div>
        </Reveal>
        <div className="fq">
          {FAQ.map(([q, a], i) => (
            <Reveal key={q} i={i}>
              <div className={`fq-i${open === i ? ' open' : ''}`}>
                <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}><span>{q}</span><i>{open === i ? '–' : '+'}</i></button>
                <div className="fq-a"><p>{a}</p></div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
