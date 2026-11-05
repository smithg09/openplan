import React from 'react';
import { TopBar as SharedTopBar, Icon, MenuItem } from '@openplan/chrome';
import { SavedPill } from './Primitives';
import { useStore } from '../store';
import { getAuthor } from '../lib/identity';
import type { Theme } from '../lib/theme';

declare const __APP_VERSION__: string;

interface TopBarProps {
  onExport?: (fmt: string) => void;
  onDownload?: () => void;
  onShare?: () => void;
  onChangeName?: () => void;
  leftOpen: boolean;
  onToggleLeft: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  openComments: number;
}

/** openplan's header: the same shell as opendocs (packages/chrome), with openplan's actions. */
export const TopBar: React.FC<TopBarProps> = ({ onExport, onDownload, onShare, onChangeName, leftOpen, onToggleLeft, panelOpen, onTogglePanel, openComments }) => {
  const { title, project, hasEdits, savedAgo, theme, setTheme } = useStore();
  const name = getAuthor() ?? 'anonymous';

  return (
    <SharedTopBar
      brand="openplan"
      brandHref="https://openplan.smithgajjar.dev"
      leading={
        <button className={`op-btn op-btn-ghost op-btn-md op-btn-icon-only${leftOpen ? ' is-active' : ''}`} title="Toggle outline and files  [" aria-label="Toggle outline and files" onClick={onToggleLeft}>
          <Icon name="panel_left" size={16} />
        </button>
      }
      title={title}
      chip={project ? <span className="op-chip">{project}</span> : undefined}
      status={hasEdits ? <SavedPill savedAgo={savedAgo} /> : undefined}
      actions={[
        { id: 'share', icon: 'share', title: 'Share plan', onClick: () => onShare?.(), hidden: !onShare },
        { id: 'comments', icon: 'panel_right', title: `Comments (${openComments} open)  ]`, onClick: onTogglePanel, active: panelOpen, badge: openComments },
      ]}
      menu={(close) => (
        <>
          <div className="op-menu-head">// theme</div>
          <div className="op-menu-theme-row">
            {([['dark', 'Dark', 'dark_mode'], ['light', 'Light', 'light_mode'], ['system', 'Auto', 'brightness_auto']] as [Theme, string, string][]).map(([v, label, icon]) => (
              <button key={v} className={`op-menu-theme-btn ${theme === v ? 'is-active' : ''}`} onClick={() => setTheme(v)}><Icon name={icon} size={15} /><span>{label}</span></button>
            ))}
          </div>
          <div className="op-menu-divider" />
          <div className="op-menu-head">// export</div>
          <MenuItem icon={<Icon name="markdown" size={15} />} label="Export annotations as MD" hint=".md" onClick={() => { close(); onExport?.('markdown'); }} />
          <MenuItem icon={<Icon name="data_object" size={15} />} label="Export annotations as JSON" hint=".json" onClick={() => { close(); onExport?.('json'); }} />
          <MenuItem icon={<Icon name="download" size={15} />} label="Download plan" onClick={() => { close(); onDownload?.(); }} />
          <div className="op-menu-divider" />
          <a className="op-menu-item op-menu-link" href="https://github.com/smithg09/openplan" target="_blank" rel="noreferrer" onClick={close}>
            <Icon name="github" size={14} /><span>GitHub repo</span><Icon name="open_in_new" size={13} />
          </a>
          <a className="op-menu-item op-menu-link" href="https://openplan.smithgajjar.dev" target="_blank" rel="noreferrer" onClick={close}>
            <Icon name="language" size={15} /><span>openplan.smithgajjar.dev</span><Icon name="open_in_new" size={13} />
          </a>
          <div className="op-menu-divider" />
          <MenuItem icon={<Icon name="person" size={15} />} label="Change name" onClick={() => { close(); onChangeName?.(); }} />
          <div className="op-menu-divider" />
          <div className="op-menu-foot"><span className="op-mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>openplan v{__APP_VERSION__}</span></div>
        </>
      )}
      avatar={{ name, onClick: () => onChangeName?.() }}
    />
  );
};
