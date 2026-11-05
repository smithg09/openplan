import React from 'react';
import { Button, Dropdown, Icon, Wordmark } from './ui';

export interface TopBarAction {
  id: string;
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  badge?: number;
  hidden?: boolean;
}

export interface TopBarProps {
  brand: string;
  brandHref: string;
  /** e.g. the left-panel toggle, placed before the wordmark. */
  leading?: React.ReactNode;
  title: string;
  /** Small chip after the title (version, project…). */
  chip?: React.ReactNode;
  /** Right-aligned status before the actions (viewers, role, saved pill…). */
  status?: React.ReactNode;
  actions: TopBarAction[];
  /** Content of the ⋯ menu. */
  menu?: (close: () => void) => React.ReactNode;
  avatar?: { name: string; onClick: () => void };
}

const initials = (name: string) => (name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase();

/**
 * The one header both products use: [panel toggle] $/brand | title chip ……… status · icon actions · ⋯ · avatar.
 * Layout and chrome are identical; each app decides which actions exist.
 */
export const TopBar: React.FC<TopBarProps> = ({ brand, brandHref, leading, title, chip, status, actions, menu, avatar }) => (
  <div className="op-topbar">
    <div className="op-topbar-left">
      {leading}
      <a href={brandHref} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}><Wordmark name={brand} /></a>
      <div className="op-topbar-divider" />
      <span className="op-plan-title">{title}</span>
      {chip}
    </div>
    <div className="op-topbar-right">
      {status}
      {actions.filter((a) => !a.hidden).map((a) => (
        <span className="op-btn-wrap" key={a.id}>
          <Button icon={<Icon name={a.icon} size={16} />} title={a.title} onClick={a.onClick} active={a.active} />
          {!!a.badge && <span className="op-badge">{a.badge}</span>}
        </span>
      ))}
      {menu && <Dropdown trigger={() => <Button icon={<Icon name="more_horiz" size={17} />} title="More" />}>{menu}</Dropdown>}
      {avatar && (<><div className="op-topbar-divider" style={{ margin: '0 6px' }} /><button className="op-avatar" title={`${avatar.name} — settings`} onClick={avatar.onClick}>{initials(avatar.name)}</button></>)}
    </div>
  </div>
);
