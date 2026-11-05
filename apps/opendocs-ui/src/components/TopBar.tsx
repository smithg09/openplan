import React from 'react';
import { Button, Dropdown, Icon, MenuItem, Wordmark, Chevron } from './ui';
import type { Role } from '../api';
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
  submitted: boolean;
  openComments: number;
  onHistory: () => void;
  onShare: () => void;
  onToggleLeft: () => void;
  onToggleRail: () => void;
  onToggleFocus: () => void;
  onSubmitReview: () => void;
  onViewLatest: () => void;
  onSetTheme: (t: Theme) => void;
  onExportMd: () => void;
  onExportJson: () => void;
  onDownloadHtml: () => void;
  onPrint: () => void;
  onUploadVersion: () => void;
  onSettings: () => void;
  onShortcuts: () => void;
}

const initials = (name: string) => (name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase();

export const TopBar: React.FC<TopBarProps> = (p) => (
  <div className="op-topbar">
    <div className="op-topbar-left">
      <Button size="md" icon={<Icon name="panel_left" size={16} />} title="Toggle files and outline  [" onClick={p.onToggleLeft} active={p.leftOpen} />
      <a href="https://opendocs.smithgajjar.dev" target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}><Wordmark /></a>
      <div className="op-topbar-divider" />
      <span className="op-plan-title">{p.title}</span>
      <button className={`od-vchip ${p.isLatest ? '' : 'is-old'}`} onClick={p.onHistory} title="Version history">
        v{p.versionNo}{!p.isLatest && <em>older</em>}
      </button>
      {p.newVersion && (
        <button className="od-newver" onClick={p.onViewLatest}><span className="op-live-dot" /> New version</button>
      )}
    </div>

    <div className="op-topbar-right">
      {p.viewers > 1 && <span className="op-pill" style={{ color: 'var(--text-muted)' }} title="People viewing right now"><span className="op-pill-dot" style={{ background: 'var(--success)' }} />{p.viewers} here</span>}
      {p.mode === 'proxy' && <span className="op-pill" style={{ color: 'var(--accent-fg)', marginRight: 4 }} title="What this link allows">{p.role}</span>}
      {p.mode === 'local' && (
        <Button size="sm" kind="ghost" disabled={p.submitted} title="Tell the agent you're done; it receives your open comments" onClick={p.onSubmitReview}>
          {p.submitted ? 'Review submitted' : 'Submit review'}
        </Button>
      )}
      <Button icon={<Icon name="history" size={16} />} title="Version history" onClick={p.onHistory} />
      <Button icon={<Icon name="fullscreen" size={16} />} title="Focus mode  f" onClick={p.onToggleFocus} active={p.focusMode} />
      {p.canShare && <Button icon={<Icon name="share" size={16} />} title="Share" onClick={p.onShare} />}
      <span className="od-btn-wrap">
        <Button icon={<Icon name="panel_right" size={16} />} title={`Comments (${p.openComments} open)  ]`} onClick={p.onToggleRail} active={p.railOpen} />
        {p.openComments > 0 && <span className="od-badge">{p.openComments}</span>}
      </span>
      <Dropdown trigger={() => <Button icon={<Icon name="more_horiz" size={17} />} title="More" />}>
        {(close) => (
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
            <MenuItem icon={<Icon name="settings" size={15} />} label="Settings" onClick={() => { close(); p.onSettings(); }} />
            <div className="op-menu-divider" />
            <a className="op-menu-item op-menu-link" href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer" onClick={close}>
              <Icon name="language" size={15} /><span>GitHub repo</span><Icon name="open_in_new" size={13} />
            </a>
          </>
        )}
      </Dropdown>
      <div className="op-topbar-divider" style={{ margin: '0 6px' }} />
      <button className="od-avatar" title={`${p.author} — settings`} onClick={p.onSettings}>{initials(p.author)}</button>
    </div>
  </div>
);

export { Chevron };
