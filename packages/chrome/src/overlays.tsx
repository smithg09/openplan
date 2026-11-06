import React from 'react';
import { Button, Icon } from './ui';

const EXIT_MS = 170;

const DismissCtx = React.createContext<() => void>(() => {});
/** Close the enclosing Modal/Drawer *with* its exit animation. */
export const useDismiss = () => React.useContext(DismissCtx);

/** Shared open/close choreography: the overlay plays an exit animation, then asks the parent to unmount. */
function useAnimatedClose(onClose: () => void) {
  const [closing, setClosing] = React.useState(false);
  const timer = React.useRef<number>();
  const dismiss = React.useCallback(() => {
    if (closing) return;
    setClosing(true);
    timer.current = window.setTimeout(onClose, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS);
  }, [closing, onClose]);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss]);
  return { closing, dismiss };
}

/** Centered dialog (openplan's overlay/modal chrome) with enter and exit transitions. */
export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; width?: number; foot?: React.ReactNode }> = ({ title, onClose, children, width = 520, foot }) => {
  const { closing, dismiss } = useAnimatedClose(onClose);
  return (
    <DismissCtx.Provider value={dismiss}>
      <div className={`op-overlay${closing ? ' is-closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
        <div className="op-modal" role="dialog" aria-modal="true" aria-label={title} style={{ width, maxWidth: 'calc(100vw - 32px)', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
          <div className="op-modal-head">
            <div className="op-modal-title">{title}</div>
            <Button size="sm" icon={<Icon name="close" size={14} />} title="Close" onClick={dismiss} />
          </div>
          <div className="op-modal-body" style={{ overflowY: 'auto', minHeight: 0 }}>{children}</div>
          {foot && <div className="op-modal-foot">{foot}</div>}
        </div>
      </div>
    </DismissCtx.Provider>
  );
};

/** Right-hand drawer (SlashDocs-style "Share document" panel) with slide transitions. */
export const Drawer: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; width?: number }> = ({ title, onClose, children, width = 420 }) => {
  const { closing, dismiss } = useAnimatedClose(onClose);
  return (
    <DismissCtx.Provider value={dismiss}>
      <div className={`op-overlay op-overlay-right${closing ? ' is-closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
        <aside className="op-drawer" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
          <div className="op-drawer-head">
            <h2>{title}</h2>
            <Button size="sm" icon={<Icon name="close" size={14} />} title="Close" onClick={dismiss} />
          </div>
          <div className="op-drawer-body">{children}</div>
        </aside>
      </div>
    </DismissCtx.Provider>
  );
};

/**
 * A side panel that slides open/closed (width + opacity) instead of popping.
 * Children stay mounted so their state survives a collapse.
 */
export const SlidePanel: React.FC<{ open: boolean; side: 'left' | 'right'; width: number; children: React.ReactNode }> = ({ open, side, width, children }) => (
  <div className={`op-slide op-slide-${side}${open ? '' : ' is-closed'}`} style={{ width: open ? width : 0 }} aria-hidden={!open} {...(!open ? { inert: '' as unknown as undefined } : {})}>
    <div className="op-slide-inner" style={{ width }}>{children}</div>
  </div>
);

/** A button that dismisses the enclosing Modal/Drawer with its exit animation. */
export const DismissButton: React.FC<{ children: React.ReactNode; kind?: 'ghost' | 'outline' | 'primary'; size?: 'sm' | 'md' | 'lg' }> = ({ children, kind = 'ghost', size = 'md' }) => {
  const dismiss = useDismiss();
  return <Button kind={kind} size={size} onClick={dismiss}>{children}</Button>;
};
