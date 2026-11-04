import React from 'react';
import { Wordmark, Bracket, Button, SavedPill } from './Primitives';
import { useStore } from '../store';
import type { Theme } from '../lib/theme';

declare const __APP_VERSION__: string;

// ── Icons (Material Symbols) ─────────────────────────────────────────────────

import { Icon } from '@openplan/annotations';

const ShareIcon = () => <Icon name="share" size={15} />;
const HamburgerIcon = () => <Icon name="menu" size={17} />;
const MoonIcon = () => <Icon name="dark_mode" size={15} />;
const SunIcon = () => <Icon name="light_mode" size={15} />;
const AutoIcon = () => <Icon name="brightness_auto" size={15} />;
const FileMdIcon = () => <Icon name="markdown" size={15} />;
const FileJsonIcon = () => <Icon name="data_object" size={15} />;
const DownloadIcon = () => <Icon name="download" size={15} />;
const GlobeIcon = () => <Icon name="language" size={15} />;
const ExtLinkIcon = () => <Icon name="open_in_new" size={13} />;
// GitHub has no Material Symbols glyph — keep the brand mark.
const GitHubIcon = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .2C3.6.2 0 3.8 0 8.2c0 3.5 2.3 6.5 5.5 7.6.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.2-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.5 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.2 0 3.1-1.9 3.7-3.6 3.9.3.2.6.7.6 1.5v2.2c0 .2.1.5.5.4 3.2-1.1 5.5-4.1 5.5-7.6C16 3.8 12.4.2 8 .2z" /></svg>;

// ── Options menu ─────────────────────────────────────────────────────────────

const UserIcon = () => <Icon name="person" size={15} />;

interface OptionsMenuProps {
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  onPrint: () => void;
  onExport: (fmt: string) => void;
  onDownload: () => void;
  onChangeName: () => void;
  onClose: () => void;
}

const OptionsMenu: React.FC<OptionsMenuProps> = ({
  theme, onSetTheme, onPrint, onExport, onDownload, onChangeName, onClose,
}) => (
  <div className="op-menu" style={{ top: '100%', right: 0, marginTop: 4, minWidth: 240 }} onClick={e => e.stopPropagation()}>
    <div className="op-menu-head">// theme</div>
    <div className="op-menu-theme-row">
      {([['dark', 'Dark', <MoonIcon />], ['light', 'Light', <SunIcon />], ['system', 'Auto', <AutoIcon />]] as [Theme, string, React.ReactNode][]).map(([v, label, icon]) => (
        <button key={v} className={`op-menu-theme-btn ${theme === v ? 'is-active' : ''}`} onClick={() => onSetTheme(v)}>
          {icon}<span>{label}</span>
        </button>
      ))}
    </div>
    <div className="op-menu-divider" />
    <div className="op-menu-head">// export</div>
    <button className="op-menu-item" onClick={() => { onClose(); onExport('markdown'); }}>
      <FileMdIcon /><span>Export annotations as MD</span><span className="op-menu-item-kbd">.md</span>
    </button>
    <button className="op-menu-item" onClick={() => { onClose(); onExport('json'); }}>
      <FileJsonIcon /><span>Export annotations as JSON</span><span className="op-menu-item-kbd">.json</span>
    </button>
    <button className="op-menu-item" onClick={() => { onClose(); onDownload(); }}>
      <DownloadIcon /><span>Download plan</span>
    </button>
    <div className="op-menu-divider" />
    <a className="op-menu-item op-menu-link" href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer" onClick={onClose}>
      <GitHubIcon /><span>GitHub repo</span><ExtLinkIcon />
    </a>
     <a className="op-menu-item op-menu-link" href="https://openplan.smithgajjar.dev" target="_blank" rel="noreferrer" onClick={onClose}>
      <GlobeIcon /><span>openplan.smithgajjar.dev</span><ExtLinkIcon />
    </a>
    {/* <a className="op-menu-item op-menu-link" href="https://openplan.smithgajjar.dev/docs" target="_blank" rel="noreferrer" onClick={onClose}>
      <BookIcon /><span>Documentation</span><ExtLinkIcon />
    </a> */}
    <div className="op-menu-divider" />
    <button className="op-menu-item" onClick={() => { onClose(); onChangeName(); }}>
      <UserIcon /><span>Change name</span>
    </button>
    <div className="op-menu-divider" />
    <div className="op-menu-foot">
      <span className="op-mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>openplan v{__APP_VERSION__}</span>
    </div>
  </div>
);

// ── TopBar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  onPrint?: () => void;
  onExport?: (fmt: string) => void;
  onDownload?: () => void;
  onShare?: () => void;
  onChangeName?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onPrint, onExport, onDownload, onShare, onChangeName }) => {
  const { mode, title, version, project, hasEdits, savedAgo, theme, setTheme } = useStore();
  const [optionsMenu, setOptionsMenu] = React.useState(false);

  React.useEffect(() => {
    if (!optionsMenu) return;
    const close = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('.op-menu, .op-options-trigger')) return;
      setOptionsMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [optionsMenu]);

  return (
    <div className="op-topbar">
      <div className="op-topbar-left">
        <a href="https://openplan.smithgajjar.dev" target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Wordmark />
        </a>
        <div className="op-topbar-divider" />
        <span className="op-plan-title">{title}</span>
        {/*<Bracket color={hasEdits ? 'var(--warning)' : undefined}>
          v{version}{hasEdits ? ' · draft' : ''}
        </Bracket>*/}
        {project && (
          <span className="op-mono" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
            · {project}
          </span>
        )}
      </div>

      <div className="op-topbar-right">
        {hasEdits && <SavedPill savedAgo={savedAgo} />}
        {onShare && (
          <button
            className="op-btn op-btn-ghost op-btn-sm"
            onClick={onShare}
            title="Share plan"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <ShareIcon /><span style={{ fontSize: 11.5 }}>share</span>
          </button>
        )}
        <div style={{ position: 'relative' }}>
          <button
            className="op-btn op-btn-ghost op-btn-md op-btn-icon-only op-options-trigger"
            onClick={e => { e.stopPropagation(); setOptionsMenu(s => !s); }}
            title="Options"
          >
            <HamburgerIcon />
          </button>
          {optionsMenu && (
            <OptionsMenu
              theme={theme}
              onSetTheme={setTheme}
              onPrint={onPrint ?? (() => { })}
              onExport={onExport ?? (() => { })}
              onDownload={onDownload ?? (() => { })}
              onChangeName={onChangeName ?? (() => { })}
              onClose={() => setOptionsMenu(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
