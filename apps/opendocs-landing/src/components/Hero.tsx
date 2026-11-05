import React, { useState } from 'react';
import { GithubIcon, CopyIcon, CheckSmIcon } from '../icons';

declare const __APP_VERSION__: string;

const AGENTS = [
  { id: 'claude', label: 'Claude Code', iconSrc: '/assets/icon-claude.svg', label2: 'Then run:', steps: ['opendocs install claude', 'Ask: “Write the Q3 launch plan as an opendocs doc”'] },
  { id: 'codex', label: 'Codex', iconSrc: '/assets/icon-codex.png', label2: 'Then run:', steps: ['opendocs install codex', 'Restart Codex, then ask it to publish a doc for review'] },
  { id: 'agy', label: 'Antigravity CLI', iconSrc: '/assets/icon-antigravity-color.png', label2: 'Then run:', steps: ['opendocs install agy', 'Restart agy, then ask it to publish a doc for review'] },
];

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="icopy" onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 2000); }}>
      {ok ? <><CheckSmIcon /> Copied</> : <><CopyIcon /> Copy</>}
    </button>
  );
}

export default function Hero() {
  const [active, setActive] = useState('claude');
  const a = AGENTS.find((x) => x.id === active)!;
  const cmd = 'curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash -s opendocs';
  return (
    <div className="hero">
      <div className="hbadge"><span className="bdot" />v{__APP_VERSION__} · Open source</div>
      <h1 className="hh1">Host, review and revise<br /><em>interactive HTML docs</em></h1>
      <p className="hsub">
        A space for agentic collaboration. Your agent publishes plans, specs and reports as HTML,
        your team comments on the exact words, and the agent ships the next version.
      </p>

      <div className="hrow">
        {AGENTS.map((x) => (
          <button key={x.id} className={`hchip${active === x.id ? ' hca' : ''}`} onClick={() => setActive(x.id)}>
            <span className="hchip-icon"><img src={x.iconSrc} alt="" className="hchip-img" /></span>{x.label}
          </button>
        ))}
      </div>

      <div className="iwrap">
        <div className="ibox">
          <span className="ips">$</span>
          <span className="icmd">curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash -s <span className="hl">opendocs</span></span>
          <CopyBtn text={cmd} />
        </div>
        <div className="islabel">{a.label2}</div>
        {a.steps.map((s) => <div className="istep" key={s}>{s}</div>)}
      </div>

      <div className="hctas">
        <a href="#demo" className="btnp">Try the review UI ↓</a>
        <a href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer" className="btno"><GithubIcon /> View on GitHub</a>
      </div>
    </div>
  );
}
