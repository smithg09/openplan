import React from 'react';
import { Wordmark, Bracket, Button, SavedPill } from './Primitives';
import { useStore } from '../store';
import type { Theme } from '../lib/theme';

declare const __APP_VERSION__: string;

// ── Icons ───────────────────────────────────────────────────────────────────

const GearIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="6.5" cy="6.5" r="2" /><path d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12M2.6 2.6l1 1M9.4 9.4l1 1M2.6 10.4l1-1M9.4 3.6l1-1" strokeLinecap="round" /></svg>;
const ClockIcon = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="6" cy="6" r="4.5" /><path d="M6 3.5V6l2 1.5" strokeLinecap="round" /></svg>;
const ShareIcon = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="3" cy="6" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="9" cy="9" r="1.5" /><path d="M4.5 5.3L7.5 3.7M4.5 6.7L7.5 8.3" /></svg>;
const DashboardIcon = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="1.5" y="1.5" width="4" height="4" rx="0.5" /><rect x="6.5" y="1.5" width="4" height="4" rx="0.5" /><rect x="1.5" y="6.5" width="4" height="4" rx="0.5" /><rect x="6.5" y="6.5" width="4" height="4" rx="0.5" /></svg>;
const HamburgerIcon = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2.5 4h9M2.5 7h9M2.5 10h9" /></svg>;
const MoonIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M10.5 7.5a4.5 4.5 0 0 1-5.5-5.5 4.5 4.5 0 1 0 5.5 5.5z" /></svg>;
const SunIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="2.2" /><path d="M6.5 1.5v1.4M6.5 10.1v1.4M1.5 6.5h1.4M10.1 6.5h1.4M2.95 2.95l1 1M9.05 9.05l1 1M2.95 10.05l1-1M9.05 3.95l1-1" /></svg>;
const AutoIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><circle cx="6.5" cy="6.5" r="4.5" /><path d="M6.5 2v9" /><path d="M6.5 2a4.5 4.5 0 0 0 0 9z" fill="currentColor" stroke="none" /></svg>;
const FileMdIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M3 1.5h4.5L10 4v7.5H3z" /><path d="M7.5 1.5V4H10" /><text x="4.5" y="9.5" fontSize="3" fontWeight="700" fill="currentColor" stroke="none" fontFamily="JetBrains Mono">MD</text></svg>;
const FilePdfIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M3 1.5h4.5L10 4v7.5H3z" /><path d="M7.5 1.5V4H10" /><text x="4.2" y="9.5" fontSize="3" fontWeight="700" fill="currentColor" stroke="none" fontFamily="JetBrains Mono">PDF</text></svg>;
const FileJsonIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M3 1.5h4.5L10 4v7.5H3z" /><path d="M7.5 1.5V4H10" /><path d="M4.5 7c-.6 0-.8.4-.8.8v.6c0 .3-.2.6-.5.6.3 0 .5.3.5.6v.6c0 .4.2.8.8.8M8.5 7c.6 0 .8.4.8.8v.6c0 .3.2.6.5.6-.3 0-.5.3-.5.6v.6c0 .4-.2.8-.8.8" strokeWidth="0.9" /></svg>;
const PrintIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M3.5 5V1.5h6V5" /><path d="M2 5h9a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H9.5v1.5h-6V10H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><circle cx="10" cy="7" r=".55" fill="currentColor" stroke="none" /></svg>;
const DownloadIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 1.5v7M3.5 6l3 3 3-3" /><path d="M2 11h9" /></svg>;
const GitHubIcon = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .2C3.6.2 0 3.8 0 8.2c0 3.5 2.3 6.5 5.5 7.6.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.2-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3s1.4.1 2 .3c1.5-1 2.2-.8 2.2-.8.5 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.2 0 3.1-1.9 3.7-3.6 3.9.3.2.6.7.6 1.5v2.2c0 .2.1.5.5.4 3.2-1.1 5.5-4.1 5.5-7.6C16 3.8 12.4.2 8 .2z" /></svg>;
const GlobeIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="6.5" cy="6.5" r="4.5" /><ellipse cx="6.5" cy="6.5" rx="2" ry="4.5" /><path d="M2 6.5h9" /></svg>;
const BookIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M2 2h4a1.5 1.5 0 0 1 1.5 1.5v8A1 1 0 0 0 6.5 11H2zM11 2H7a1.5 1.5 0 0 0-1.5 1.5v8A1 1 0 0 1 6.5 11H11z" /></svg>;
const ExtLinkIcon = () => <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M3.5 2.5H2v5.5h5.5V6.5M5 2.5h3v3M5 5l3-3" /></svg>;

// ── Options menu ─────────────────────────────────────────────────────────────

const UserIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="6.5" cy="4.5" r="2" /><path d="M2 11c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" /></svg>;

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
