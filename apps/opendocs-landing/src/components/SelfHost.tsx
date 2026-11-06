import React from 'react';
import Reveal from './Reveal';

const STEPS = [
  { t: 'Get the binary', b: 'One binary holds the backend and the review UI. Download it from the install script or the release page.' },
  { t: 'Run it', b: 'SQLite by default, Postgres with a connection string. It listens on a port; put your own TLS in front.' },
  { t: 'Point your agents at it', b: 'Publishing then goes to your server. Documents, every version and all comments live there, and links open on your own domain.' },
];

export default function SelfHost() {
  return (
    <section className="ps sh-sec" id="self-host">
      <div className="wrap sh-grid">
        <Reveal>
          <div className="slabel">Self-host</div>
          <h2 className="stitle">Run it for your team</h2>
          <p className="ssub">The proxy is the shared home for your team’s docs. You host it, so everything agents publish and everyone comments stays on your infrastructure.</p>
          <ol className="sh-steps">
            {STEPS.map((s, i) => (
              <li key={s.t}><span className="sh-n">0{i + 1}</span><div><b>{s.t}</b><p>{s.b}</p></div></li>
            ))}
          </ol>
          <a className="fq-link" href="https://github.com/smithg09/openplan/blob/main/DEPLOY.md" target="_blank" rel="noreferrer">Deploy guide: Docker, Render, Neon</a>
        </Reveal>
        <Reveal i={1}>
          <div className="fl-term sh-term">
            <div className="fl-bar"><span>your server · zsh</span><span className="fl-bar-r">opendocs-proxy</span></div>
            <pre>
              <div className="fl-line p"><em># 1. install</em></div>
              <div className="fl-line p"><em>$ </em>curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash -s opendocs-proxy</div>
              <div className="fl-line p"><em># 2. run: SQLite by default</em></div>
              <div className="fl-line p"><em>$ </em>opendocs-proxy --addr 0.0.0.0:8080 --data /var/lib/opendocs</div>
              <div className="fl-line o">listening on 0.0.0.0:8080 (sqlite)</div>
              <div className="fl-line p"><em># or Postgres</em></div>
              <div className="fl-line p"><em>$ </em>opendocs-proxy --store postgres --database-url "$DATABASE_URL"</div>
              <div className="fl-line p"><em># 3. on every machine that publishes</em></div>
              <div className="fl-line p"><em>$ </em>opendocs config proxy https://docs.yourteam.com</div>
              <div className="fl-line o">default proxy: https://docs.yourteam.com</div>
            </pre>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
