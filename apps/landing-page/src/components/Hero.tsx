import React, { useState } from 'react';
import { GithubIcon, CopyIcon, CheckSmIcon } from '../icons';

const HARNESSES = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    iconSrc: '/assets/icon-claude.svg',
    current: true,
    stepLabel: 'Then run in Claude Code:',
    steps: [
      '/plugin marketplace add smithg09/openplan',
      '/plugin install openplan@openplan',
      'Restart Claude Code to activate hooks',
    ],
  },
  {
    id: 'codex',
    label: 'Codex',
    iconSrc: '/assets/icon-codex.png',
    current: false,
    steps: ['Codex support coming soon'],
  },
  {
    id: 'copilot',
    label: 'Copilot',
    iconSrc: '/assets/icon-copilot.svg',
    current: false,
    steps: ['Copilot support coming soon'],
  },
  {
    id: 'antigravity',
    label: 'Antigravity CLI',
    iconSrc: '/assets/icon-antigravity-color.png',
    current: false,
    steps: ['Antigravity CLI support coming soon'],
  },
  {
    id: 'vscode',
    label: 'VS Code',
    iconSrc: '/assets/icon-vscode.svg',
    current: false,
    steps: ['VS Code support coming soon'],
  },
];

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="icopy"
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => { });
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
    >
      {ok ? <><CheckSmIcon /> Copied</> : <><CopyIcon /> Copy</>}
    </button>
  );
}

export default function Hero() {
  const [active, setActive] = useState('claude-code');
  const h = HARNESSES.find(x => x.id === active)!;
  const cmd = 'curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash';

  return (
    <div className="hero">
      <div className="hbadge">
        <span className="bdot" />
        v0.2.0 · Early access
      </div>

      <h1 className="hh1">
        Review, annotate and approve<br />
        <em>agent plans</em>
      </h1>

      <p className="hsub">
        Openplan intercepts your agent's plan step, opens it in a browser UI,
        and lets you annotate, approve, or deny before any code is written.
      </p>

      {/* Harness switcher */}
      <div className="hrow">
        {HARNESSES.map(x => (
          <button
            key={x.id}
            className={`hchip${active === x.id ? ' hca' : ''}${!x.current ? ' hcs' : ''}`}
            onClick={() => setActive(x.id)}
          >
            <span className="hchip-icon">
              <img src={x.iconSrc} alt="" className="hchip-img" />
            </span>
            {x.label}
            {!x.current && <span className="hstag">soon</span>}
          </button>
        ))}
      </div>

      {/* Install box */}
      <div className="iwrap">
        <div className="ibox">
          <span className="ips">$</span>
          <span className="icmd">
            <span className="hl">curl</span> -fsSL https://openplan.smithgajjar.dev/install.sh | bash
          </span>
          <CopyBtn text={cmd} />
        </div>
        {h.stepLabel && <div className="islabel">{h.stepLabel}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {h.steps.map((s, i) => (
            <div key={i} className={`istep${!h.current ? ' isoon' : ''}`}>{s}</div>
          ))}
        </div>
      </div>

      <div className="hctas">
        <a href="https://openplan.smithgajjar.dev/app/" target="_blank" rel="noreferrer" className="btnp">
          Try live demo →
        </a>
        <a href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer" className="btno">
          <GithubIcon /> View on GitHub
        </a>
      </div>
    </div>
  );
}
