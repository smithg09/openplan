import React from 'react';

const INSTALL = 'curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash -s opendocs';
const AGENTS = [
  { id: 'claude', name: 'Claude Code', cmd: 'opendocs install claude' },
  { id: 'codex', name: 'Codex CLI', cmd: 'opendocs install codex' },
  { id: 'agy', name: 'Antigravity', cmd: 'opendocs install agy' },
];

function Cmd({ cmd }: { cmd: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button className="cmd" onClick={() => { void navigator.clipboard?.writeText(cmd).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }); }} title="Copy">
      <span className="cmd-p">$</span><code>{cmd}</code><span className="cmd-copy">{done ? 'copied' : 'copy'}</span>
    </button>
  );
}

export default function Install() {
  const [agent, setAgent] = React.useState(AGENTS[0].id);
  const a = AGENTS.find((x) => x.id === agent)!;
  return (
    <section className="sec alt" id="install">
      <div className="wrap narrow">
        <h2 className="h2 c">Get started in a minute</h2>
        <ol className="isteps">
          <li><div className="inum">1</div><div><h4>Install the binary</h4><Cmd cmd={INSTALL} /></div></li>
          <li><div className="inum">2</div><div><h4>Teach your agent</h4>
            <div className="tabs" role="tablist">{AGENTS.map((x) => <button key={x.id} role="tab" aria-selected={x.id === agent} className={x.id === agent ? 'on' : ''} onClick={() => setAgent(x.id)}>{x.name}</button>)}</div>
            <Cmd cmd={a.cmd} /><p className="muted s">Installs the publish, review, open and archive skills where {a.name} looks for them.</p></div></li>
          <li><div className="inum">3</div><div><h4>Ask for a document</h4><p className="muted">“Write the Q3 launch plan as an opendocs doc and open it for review.” The agent writes the HTML, publishes it, and reads your comments when you’re done.</p></div></li>
        </ol>
        <p className="sub c">Want to share beyond your machine? Run <code>opendocs-proxy</code> — one binary, SQLite or Postgres — or <Cmd cmd="curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash -s opendocs-proxy" /></p>
      </div>
    </section>
  );
}
