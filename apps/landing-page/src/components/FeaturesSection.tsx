import React from 'react';

// ── Commands (openplan context removed; openplan serve marked soon)
const commands = [
  {
    cmd: 'openplan',
    desc: 'Automatic: hooks into ExitPlanMode. Claude finishes planning → browser opens instantly.',
    soon: false,
  },
  {
    cmd: 'openplan annotate [file|dir]',
    desc: 'Open any markdown file, folder, or URL in the full annotation UI and send feedback.',
    soon: false,
  },
  {
    cmd: 'openplan serve',
    desc: 'Start a persistent dashboard to browse, search, and re-open all saved plans.',
    soon: true,
  },
  {
    cmd: 'openplan sessions',
    desc: 'List all active openplan sessions with their PID, port, and current mode.',
    soon: false,
  },
];

// ── Features ("8 annotation types" and "plan versioning" removed)
const features = [
  {
    name: 'Runs locally',
    desc: 'Plans never leave your machine. No telemetry, no cloud, no account required.',
    current: true,
  },
  {
    name: 'Claude Code plugin',
    desc: 'One-line install via the plugin marketplace. Hooks register automatically — no manual config.',
    current: true,
  },
  {
    name: 'Plan sharing',
    desc: 'Share any plan via encrypted URL — data lives in the link itself, no server needed.',
    current: false,
  },
  {
    name: 'More harnesses',
    desc: 'Codex, VS Code Copilot, Antigravity CLI and more — one annotation layer across all your agents.',
    current: false,
  },
  {
    name: 'Obsidian & Notion',
    desc: 'Auto-push plans to your vault or database with frontmatter, tags, and backlinks.',
    current: false,
  },
];

// ── Skills (/openplan-review removed)
const skills = [
  {
    cmd: '/openplan',
    desc: 'Review and approve the current plan in the browser.',
    current: true,
  },
  {
    cmd: '/openplan-annotate',
    desc: 'Annotate any markdown file, spec, folder, or URL and send structured feedback.',
    current: true,
  },
  {
    cmd: '/openplan-last',
    desc: "Re-annotate the agent's last message directly from chat.",
    current: true,
  },
  {
    cmd: '/openplan-archive',
    desc: 'Archive the current plan to ~/.openplan/plans/ for later review.',
    current: true,
  },
];

export default function FeaturesSection() {
  return (
    <section
      className="ps"
      style={{ background: 'var(--bg-deep)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
    >
      <div className="wrap">
        <div className="sc">
          <div className="slabel">// everything openplan does</div>
          <h2 className="stitle">Built for the whole annotation workflow</h2>
          <p className="ssub">
            Commands, features, and skills — available today and on the roadmap.
            No native harness integration yet? Use skills directly in agent chat.
          </p>
        </div>

        <div className="ftable">
          {/* Commands */}
          <div className="ftcol">
            <div className="fthd">Commands</div>
            {commands.map(f => (
              <div key={f.cmd} className="ftrow">
                <div className="ftcmd">
                  {f.cmd}
                  {f.soon && <span className="ftsoon" style={{ marginLeft: 8 }}>soon</span>}
                </div>
                <div className="ftdesc">{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="ftcol">
            <div className="fthd">Features</div>
            {features.map(f => (
              <div key={f.name} className={`ftrow${!f.current ? ' ftdim' : ''}`}>
                <div className="ftname">
                  {f.name}
                  {!f.current && <span className="ftsoon">soon</span>}
                </div>
                <div className="ftdesc">{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Skills */}
          <div className="ftcol">
            <div className="fthd">Skills</div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-faint)', marginBottom: 16, lineHeight: 1.6 }}>
              No native integration for your harness? Run these slash commands directly in agent chat.
            </p>
            {skills.map(f => (
              <div key={f.cmd} className={`ftrow${!f.current ? ' ftdim' : ''}`}>
                <div className="ftcmd" style={!f.current ? { color: 'var(--text-faint)' } : {}}>
                  {f.cmd}
                  {!f.current && <span className="ftsoon" style={{ marginLeft: 8 }}>soon</span>}
                </div>
                <div className="ftdesc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Annotation type strip removed per requirements */}
      </div>
    </section>
  );
}
