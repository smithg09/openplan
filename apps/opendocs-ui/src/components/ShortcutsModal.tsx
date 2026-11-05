import React from 'react';
import { Modal } from './ui';

const KEYS: [string, string][] = [
  ['Select text', 'Show the comment toolbar'],
  ['⌘ ↵  /  Ctrl ↵', 'Post the comment'],
  ['Esc', 'Cancel / close'],
  ['[', 'Toggle files and outline'],
  [']', 'Toggle comments'],
  ['f', 'Focus mode (hide both panels)'],
  ['h', 'Version history'],
  ['?', 'This list'],
];

export const ShortcutsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Modal title="Keyboard shortcuts" onClose={onClose} width={440}>
    <div className="od-keys">
      {KEYS.map(([k, d]) => (<React.Fragment key={k}><kbd>{k}</kbd><span>{d}</span></React.Fragment>))}
    </div>
  </Modal>
);
