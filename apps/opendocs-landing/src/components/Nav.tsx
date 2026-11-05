import React from 'react';
import { SiteSwitcher } from '@openplan/shared';
import { GithubIcon, SunIcon, MoonIcon } from '../icons';

export default function Nav({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <nav>
      <div className="ni">
        <SiteSwitcher current="opendocs" />
        <div className="ns" />
        <div className="nl">
          <a href="#demo" className="nlink nhide">Try it</a>
          <a href="#flow" className="nlink nhide">How it works</a>
          <a href="#faq" className="nlink nhide">FAQ</a>
          <button className="thm" onClick={onToggle} title="Toggle theme">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</button>
          <a href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer" className="nlink"><GithubIcon /> GitHub</a>
          <a href="#install" className="ncta">Get started →</a>
        </div>
      </div>
    </nav>
  );
}
