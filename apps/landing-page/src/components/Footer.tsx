import React from 'react';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="fi">
          <div className="wm">
            <span className="wm-p">$</span>
            <span className="wm-s">/</span>
            <span className="wm-n">openplan</span>
          </div>
          <div className="fsp" />
          <div className="footer-links">
            <a href="https://openplan.smithgajjar.dev/app/" target="_blank" rel="noreferrer" className="fl">
              openplan.smithgajjar.dev/app
            </a>
            <span className="fsep">·</span>
            <a href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer" className="fl">
              GitHub
            </a>
            <span className="fsep">·</span>
            <span className="fcp">MIT © 2026 smithgajjar.dev</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
