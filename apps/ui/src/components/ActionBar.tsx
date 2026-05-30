import React from 'react';
import { Button, Chevron } from './Primitives';
import { useStore } from '../store';

interface ActionBarProps {
  onApprove: (mode?: string) => void;
  onRequestChanges: () => void;
  onAskClaude: (kind: string) => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  onApprove, onRequestChanges, onAskClaude,
}) => {
  const { hasEdits, annotations } = useStore();
  const [showApproveMenu, setShowApproveMenu] = React.useState(false);
  const [showAskMenu, setShowAskMenu] = React.useState(false);
  const annotationsCount = annotations.filter(a => !a.resolved).length;

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
        title={annotationsCount > 0 ? 'Send your annotations via Request Changes first' : undefined}
      >
        <Button kind="primary" size="md" onClick={() => onApprove()} kbd="⌘↵" splitRight disabled={annotationsCount > 0}>
          {hasEdits ? 'approve with edits' : 'approve'}
        </Button>
        <Button kind="primary" size="md" onClick={() => setShowApproveMenu(s => !s)} style={{ padding: '0 8px' }} disabled={annotationsCount > 0}>
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
