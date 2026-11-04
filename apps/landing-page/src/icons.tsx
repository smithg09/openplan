import React from 'react';
import { Icon } from '@openplan/annotations';

// Shared Hugeicons-backed icon (single registry lives in @openplan/annotations).
export { Icon };

// GitHub — brand mark, no icon-set glyph.
export const GithubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export const SunIcon = () => <Icon name="light_mode" size={15} />;
export const MoonIcon = () => <Icon name="dark_mode" size={15} />;

// Agent CLI markers
export const TerminalIcon = ({ size = 14, color }: { size?: number; color?: string }) => <Icon name="terminal" size={size} color={color} />;
export const Code2Icon = ({ size = 14, color }: { size?: number; color?: string }) => <Icon name="code" size={size} color={color} />;
export const BotIcon = ({ size = 14, color }: { size?: number; color?: string }) => <Icon name="smart_toy" size={size} color={color} />;
export const ZapIcon = ({ size = 14, color }: { size?: number; color?: string }) => <Icon name="bolt" size={size} color={color} fill />;
export const LayoutIcon = ({ size = 14, color }: { size?: number; color?: string }) => <Icon name="space_dashboard" size={size} color={color} />;

export const CheckIcon = ({ size = 24 }: { size?: number }) => <Icon name="check" size={size} weight={600} />;
export const UndoIcon = ({ size = 22 }: { size?: number }) => <Icon name="undo" size={size} weight={600} />;
export const CopyIcon = () => <Icon name="content_copy" size={13} />;
export const CheckSmIcon = () => <Icon name="check" size={13} weight={600} />;

// Annotation tool icons (match packages/toolbar/src/icons.tsx)
export const CommentSVG = ({ c }: { c: string }) => <Icon name="chat_bubble" size={16} color={c} fill weight={500} />;
export const TrashSVG = ({ c }: { c: string }) => <Icon name="delete" size={16} color={c} fill weight={500} />;
export const PenSVG = ({ c }: { c: string }) => <Icon name="edit" size={16} color={c} fill weight={500} />;
export const QSvg = ({ c }: { c: string }) => <Icon name="help" size={16} color={c} fill weight={500} />;
export const SmileySVG = ({ c }: { c: string }) => <Icon name="mood" size={16} color={c} fill weight={500} />;
