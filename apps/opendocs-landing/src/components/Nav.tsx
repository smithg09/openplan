import React from 'react';
import { SiteSwitcher } from '@openplan/chrome';
import { Icon, GithubIcon, SunIcon, MoonIcon } from '../icons';

export default function Nav({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  return (
    <nav>
      <div className="ni">
        <SiteSwitcher current="opendocs" />
        <div className="ns" />
        <div className="nl">
          <button className="thm" onClick={onToggle} title="Toggle theme">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</button>
          <a href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer" className="nlink"><GithubIcon /> GitHub</a>
          <a href="/app/" className="ncta">Open app <Icon name="arrow_right" size={13} /></a>
        </div>
      </div>
    </nav>
  );
}
