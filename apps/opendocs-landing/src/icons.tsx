import React from 'react';
import { Icon } from '@openplan/annotations';

// Shared Hugeicons-backed icon (single registry lives in @openplan/annotations).
export { Icon };

// GitHub — brand mark, no icon-set glyph.
export const GithubIcon = () => <Icon name="github" size={14} />;

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
