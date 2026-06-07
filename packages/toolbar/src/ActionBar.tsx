import React from 'react';

// ── Inlined primitives from Primitives.tsx to keep it self-contained ───────────

interface ButtonProps {
  kind?: 'ghost' | 'outline' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  kbd?: string;
  badge?: number | string;
  splitRight?: boolean;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
}

const Button: React.FC<ButtonProps> = ({
  kind = 'ghost', size = 'md', icon, children, onClick, disabled, kbd, badge, splitRight, style, className, title, type = 'button',
}) => (
  <button
    type={type}
    title={title}
    className={[
      'op-btn',
      `op-btn-${kind}`,
      `op-btn-${size}`,
      !children && icon ? 'op-btn-icon-only' : '',
      splitRight ? 'op-btn-split-l' : '',
      className ?? '',
    ].filter(Boolean).join(' ')}
    onClick={onClick}
    disabled={disabled}
    style={style}
  >
    {icon && <span className="op-btn-icon">{icon}</span>}
    {children && <span>{children}</span>}
    {badge !== undefined && badge !== null && (
      <span className="op-btn-badge">{badge}</span>
    )}
    {kbd && <span className="op-btn-kbd">{kbd}</span>}
  </button>
);

const Chevron: React.FC<{ dir?: 'down' | 'up' | 'left' | 'right'; size?: number }> = ({ dir = 'down', size = 10 }) => {
  const rot = { down: 0, up: 180, right: -90, left: 90 }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ transform: `rotate(${rot}deg)`, transition: 'transform 120ms', display: 'inline-block', flexShrink: 0 }}>
      <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Shared ActionBar Component ───────────────────────────────────────────────

export interface ActionBarProps {
  hasEdits: boolean;
  annotationsCount: number;
  onApprove: (mode?: string) => void;
  onRequestChanges: () => void;
  onAskClaude: (kind: string) => void;
  alwaysEnableApprove?: boolean;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  hasEdits, annotationsCount, onApprove, onRequestChanges, onAskClaude, alwaysEnableApprove = false,
}) => {
  const [showApproveMenu, setShowApproveMenu] = React.useState(false);
  const [showAskMenu, setShowAskMenu] = React.useState(false);

  React.useEffect(() => {
    if (!showApproveMenu && !showAskMenu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.op-actionbar')) {
        setShowApproveMenu(false);
        setShowAskMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showApproveMenu, showAskMenu]);

  const isApproveDisabled = alwaysEnableApprove ? false : annotationsCount > 0;

  return (
    <div className="op-actionbar">
      <div style={{ position: 'relative' }}>
        <Button kind="ghost" size="md" onClick={() => setShowAskMenu(s => !s)} style={{ whiteSpace: 'nowrap' }}>
          ask claude to…
          <Chevron dir="up" size={9} />
        </Button>
        {showAskMenu && (
          <div className="op-menu" style={{ bottom: 'calc(100% + 4px)', left: 0 }}>
            <div className="op-menu-head">// skill invocations</div>
            <button className="op-menu-item" onClick={() => { onAskClaude('phases'); setShowAskMenu(false); }}>
              Convert to phases
              <span className="op-menu-item-desc">break into handoff documents</span>
            </button>
            <button className="op-menu-item" onClick={() => { onAskClaude('grill'); setShowAskMenu(false); }}>
              Grill plan
              <span className="op-menu-item-desc">challenge against domain model</span>
            </button>
            <button className="op-menu-item" onClick={() => { onAskClaude('improve'); setShowAskMenu(false); }}>
              Improve architecture
            </button>
            <button className="op-menu-item" onClick={() => { onAskClaude('handoff'); setShowAskMenu(false); }}>
              Create handoff document
            </button>
          </div>
        )}
      </div>

      <Button
        kind="outline"
        size="md"
        onClick={onRequestChanges}
        badge={annotationsCount > 0 ? annotationsCount : undefined}
      >
        request changes
      </Button>

      <div
        className="op-split"
        style={{ position: 'relative' }}
        title={isApproveDisabled ? 'Send your annotations via Request Changes first' : undefined}
      >
        <Button kind="primary" size="md" onClick={() => onApprove()} kbd="⌘↵" splitRight disabled={isApproveDisabled}>
          {hasEdits ? 'approve with edits' : 'approve'}
        </Button>
        <Button kind="primary" size="md" onClick={() => setShowApproveMenu(s => !s)} style={{ padding: '0 8px' }} disabled={isApproveDisabled}>
          <Chevron dir="up" size={9} />
        </Button>
        {showApproveMenu && (
          <div className="op-menu" style={{ bottom: 'calc(100% + 4px)', right: 0 }}>
            <div className="op-menu-head">// permission mode</div>
            <button className="op-menu-item" onClick={() => { setShowApproveMenu(false); onApprove('default'); }}>
              Approve (default mode)
              <span className="op-menu-item-desc">no permission change</span>
            </button>
            <button className="op-menu-item" onClick={() => { setShowApproveMenu(false); onApprove('auto'); }}>
              Approve + auto-approve next
              <span className="op-menu-item-desc">accept subsequent tool calls</span>
            </button>
            <button className="op-menu-item" onClick={() => { setShowApproveMenu(false); onApprove('plan-only'); }}>
              Approve + plan-only mode
              <span className="op-menu-item-desc">stay in plan mode</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
