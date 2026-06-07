import React from 'react';
import { GithubIcon, SunIcon, MoonIcon } from '../icons';

interface NavProps {
  theme: 'dark' | 'light';
  onToggle: () => void;
}

export default function Nav({ theme, onToggle }: NavProps) {
  return (
    <nav>
      <div className="ni">
        <a href="#" className="wm">
          <span className="wm-p">$</span>
          <span className="wm-s">/</span>
          <span className="wm-n">openplan</span>
        </a>
        <div className="ns" />
        <div className="nl">
          <button className="thm" onClick={onToggle} title="Toggle theme">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <a href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer" className="nlink">
            <GithubIcon /> GitHub
          </a>
          <a href="https://openplan.smithgajjar.dev/app/" target="_blank" rel="noreferrer" className="ncta">
            Try Demo →
          </a>
        </div>
      </div>
    </nav>
  );
}
