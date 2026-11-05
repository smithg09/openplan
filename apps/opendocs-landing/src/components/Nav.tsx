import React from 'react';
import { SiteSwitcher } from '@openplan/shared';

const REPO = 'https://github.com/smithg09/openplan';

export default function Nav({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <nav>
      <div className="ni">
        <SiteSwitcher current="opendocs" />
        <div className="ns" />
        <a className="nlink nhide" href="#how">How it works</a>
        <a className="nlink nhide" href="#features">Features</a>
        <a className="nlink nhide" href="#faq">FAQ</a>
        <button className="thm" onClick={onToggle} title="Toggle theme" aria-label="Toggle theme">{theme === 'dark' ? '☀' : '☾'}</button>
        <a className="nlink" href={REPO} target="_blank" rel="noreferrer">GitHub</a>
        <a className="ncta" href="#install">Get started →</a>
      </div>
    </nav>
  );
}
