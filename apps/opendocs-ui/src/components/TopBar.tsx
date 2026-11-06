import React from 'react';
import { TopBar as SharedTopBar, Icon, MenuItem } from '@openplan/chrome';
import type { Role } from '../api';
import type { AccountUser } from '../account';
import type { Theme } from '../lib/theme';

export interface TopBarProps {
  mode: 'local' | 'proxy';
  title: string;
  versionNo: number;
  isLatest: boolean;
  role: Role;
  viewers: number;
  newVersion: boolean;
  author: string;
  theme: Theme;
  leftOpen: boolean;
  railOpen: boolean;
  focusMode: boolean;
  canShare: boolean;
  canWrite: boolean;
  openComments: number;
  onHistory: () => void;
  onShare: () => void;
  onToggleLeft: () => void;
  onToggleRail: () => void;
  onToggleFocus: () => void;
  onViewLatest: () => void;
  onSetTheme: (t: Theme) => void;
  onExportMd: () => void;
  onExportJson: () => void;
  onDownloadHtml: () => void;
  onPrint: () => void;
  onUploadVersion: () => void;
  onSettings: () => void;
  onProxy: () => void;
  onShortcuts: () => void;
  /** Back to the documents home (absent when there is none, e.g. a proxy's own UI). */
  onHome?: () => void;
  /** Present only when accounts are enabled in this build. */
  account?: { user: AccountUser | null; onOpen: () => void };
}

export const TopBar: React.FC<TopBarProps> = (p) => (
  <SharedTopBar
    brand="opendocs"
    brandHref="https://opendocs.smithgajjar.dev"
    leading={
      <>
        <button className={`op-btn op-btn-ghost op-btn-md op-btn-icon-only${p.leftOpen ? ' is-active' : ''}`} title="Toggle files and outline  [" aria-label="Toggle files and outline" onClick={p.onToggleLeft}>
          <Icon name="panel_left" size={16} />
        </button>
        {p.onHome && (
          <button className="op-btn op-btn-ghost op-btn-md op-btn-icon-only" title="All documents" aria-label="All documents" onClick={p.onHome}>
            <Icon name="arrow_back" size={16} />
          </button>
        )}
      </>
    }
    title={p.title}
    chip={
      <>
        <button className="op-chip" onClick={p.onHistory} title="Version history">v{p.versionNo}{!p.isLatest && <em style={{ fontStyle: 'normal', color: 'var(--warning)' }}>older</em>}</button>
        {p.newVersion && <button className="od-newver" onClick={p.onViewLatest}><span className="op-live-dot" /> New version</button>}
      </>
    }
    status={
      <>
        {p.viewers > 1 && <span className="op-pill" style={{ color: 'var(--text-muted)' }} title="People viewing right now"><span className="op-pill-dot" style={{ background: 'var(--success)' }} />{p.viewers} here</span>}
        {p.mode === 'proxy' && <span className="op-pill" style={{ color: 'var(--accent-fg)', marginRight: 4 }} title="What this link allows">{p.role}</span>}
      </>
    }
    actions={[
      { id: 'history', icon: 'history', title: 'Version history  h', onClick: p.onHistory },
      { id: 'focus', icon: 'fullscreen', title: 'Focus mode  f', onClick: p.onToggleFocus, active: p.focusMode },
      { id: 'share', icon: 'share', title: 'Share', onClick: p.onShare, hidden: !p.canShare },
      { id: 'comments', icon: 'panel_right', title: `Comments (${p.openComments} open)  ]`, onClick: p.onToggleRail, active: p.railOpen, badge: p.openComments },
    ]}
    menu={(close) => (
      <>
        <div className="op-menu-head">// theme</div>
        <div className="op-menu-theme-row">
          {([['dark', 'Dark', 'dark_mode'], ['light', 'Light', 'light_mode'], ['system', 'Auto', 'brightness_auto']] as [Theme, string, string][]).map(([v, label, icon]) => (
            <button key={v} className={`op-menu-theme-btn ${p.theme === v ? 'is-active' : ''}`} onClick={() => p.onSetTheme(v)}><Icon name={icon} size={15} /><span>{label}</span></button>
          ))}
        </div>
        <div className="op-menu-divider" />
        <div className="op-menu-head">// export</div>
        <MenuItem icon={<Icon name="markdown" size={15} />} label="Export comments as MD" hint=".md" onClick={() => { close(); p.onExportMd(); }} />
        <MenuItem icon={<Icon name="data_object" size={15} />} label="Export comments as JSON" hint=".json" onClick={() => { close(); p.onExportJson(); }} />
        <MenuItem icon={<Icon name="download" size={15} />} label="Download HTML" onClick={() => { close(); p.onDownloadHtml(); }} />
        <MenuItem icon={<Icon name="pdf" size={15} />} label="Export as PDF" hint="print" onClick={() => { close(); p.onPrint(); }} />
        {p.canWrite && <MenuItem icon={<Icon name="upload" size={15} />} label="Upload new version" onClick={() => { close(); p.onUploadVersion(); }} />}
        <div className="op-menu-divider" />
        <MenuItem icon={<Icon name="keyboard" size={15} />} label="Keyboard shortcuts" hint="?" onClick={() => { close(); p.onShortcuts(); }} />
        {p.account && <MenuItem icon={<Icon name="person" size={15} />} label={p.account.user ? 'Account' : 'Sign in'} hint={p.account.user?.email} onClick={() => { close(); p.account!.onOpen(); }} />}
        <MenuItem icon={<Icon name="link" size={15} />} label="Proxy" onClick={() => { close(); p.onProxy(); }} />
        <MenuItem icon={<Icon name="settings" size={15} />} label="Settings" onClick={() => { close(); p.onSettings(); }} />
        <div className="op-menu-divider" />
        <a className="op-menu-item op-menu-link" href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer" onClick={close}>
          <Icon name="language" size={15} /><span>GitHub repo</span><Icon name="open_in_new" size={13} />
        </a>
      </>
    )}
    avatar={{ name: p.author, onClick: p.account ? p.account.onOpen : p.onSettings, ...(p.account ? { badgeIcon: p.account.user ? undefined : 'login', title: p.account.user ? `${p.account.user.name} — account` : 'Profile and sign in' } : {}) }}
  />
);
