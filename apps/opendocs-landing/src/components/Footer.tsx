import React from 'react';

export default function Footer() {
  return (
    <>
      <section className="cta">
        <div className="wrap">
          <h2>Ready to review what your agents ship?</h2>
          <p>Open-source, local-first, and one command away.</p>
          <div className="hero-cta c">
            <a className="btn btn-primary" href="#install">Get started</a>
            <a className="btn btn-ghost" href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer">View on GitHub</a>
          </div>
        </div>
      </section>
      <footer className="footer">
        <div className="wrap fi">
          <div className="wm"><span className="wm-p">$</span><span className="wm-s">/</span><span className="wm-n">opendocs</span></div>
          <div className="fsp" />
          <div className="footer-links">
            <a href="https://openplan.smithgajjar.dev">openplan</a><span>·</span>
            <a href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer">GitHub</a><span>·</span>
            <span>MIT © 2026 smithgajjar.dev</span>
          </div>
        </div>
        <p className="credit wrap">Inspired by Razorpay’s <a href="https://github.com/razorpay/slashdocs" target="_blank" rel="noreferrer">SlashDocs</a> (MIT). opendocs is an independent project.</p>
      </footer>
    </>
  );
}
