import React from 'react';

const GIF_URL = 'https://raw.githubusercontent.com/smithg09/openplan/main/assets/openplan_demo.gif';

export default function GifSection() {
  return (
    <div className="gifsec">
      <div className="wrap sc">
        <div className="slabel">// see it in action</div>
        <h2 className="stitle">Watch openplan in action</h2>
        <p className="ssub">
          Hooks into your agent's plan step. Zero config with the Claude Code plugin.
        </p>
        <div className="gifframe">
          <div className="gifbar">
            <span className="gbdot" style={{ background: '#ff5f56' }} />
            <span className="gbdot" style={{ background: '#ffbd2e' }} />
            <span className="gbdot" style={{ background: '#27c93f' }} />
          </div>
          <img src={GIF_URL} alt="Openplan demo, plan review in action" loading="lazy" />
        </div>
      </div>
    </div>
  );
}
