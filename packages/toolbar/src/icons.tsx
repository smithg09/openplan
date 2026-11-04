import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Comment01Icon, HelpCircleIcon, Idea01Icon, Delete02Icon, SmileIcon, HighlighterIcon,
  Tick02Icon, CheckmarkSquare01Icon,
} from '@hugeicons/core-free-icons';

export const ANNOTATION_TYPES: Record<string, { label: string; colorVar: string; letter: string }> = {
  comment:    { label: 'Comment',  colorVar: '--comment',    letter: 'C' },
  deletion:   { label: 'Delete',   colorVar: '--danger',     letter: 'D' },
  suggestion: { label: 'Suggest',  colorVar: '--teal',       letter: 'S' },
  question:   { label: 'Question', colorVar: '--question',   letter: 'Q' },
  emoji:      { label: 'Reaction', colorVar: '--text-muted', letter: 'E' },
};

// ── Icon system: Hugeicons ───────────────────────────────────────────────────
// Mirrors @openplan/annotations' icon set for the annotation-type glyphs the
// toolbar renders. SCALE matches the annotations package.
const REGISTRY: Record<string, Parameters<typeof HugeiconsIcon>[0]['icon']> = {
  chat_bubble:     Comment01Icon,
  help:            HelpCircleIcon,
  lightbulb:       Idea01Icon,
  delete:          Delete02Icon,
  mood:            SmileIcon,
  ink_highlighter: HighlighterIcon,
  check:           Tick02Icon,
  check_box:       CheckmarkSquare01Icon,
};

const SCALE = 1.05;

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
}
export const Icon: React.FC<IconProps> = ({ name, size = 16, color, strokeWidth, style, className }) => (
  <HugeiconsIcon
    icon={REGISTRY[name] ?? Comment01Icon}
    size={Math.round(size * SCALE)}
    color={color ?? 'currentColor'}
    strokeWidth={strokeWidth ?? 1.8}
    className={className}
    style={{ flexShrink: 0, ...style }}
  />
);

const LIGATURES: Record<string, string> = {
  comment:       'chat_bubble',
  question:      'help',
  suggestion:    'lightbulb',
  deletion:      'delete',
  emoji:         'mood',
  highlight:     'ink_highlighter',
  approval:      'check',
  'action-item': 'check_box',
};

export const CustomIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 12 }) => (
  <Icon name={LIGATURES[type] ?? 'chat_bubble'} size={size} />
);

export const AnnoIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 12 }) => {
  const meta = ANNOTATION_TYPES[type] ?? ANNOTATION_TYPES['comment'];
  return (
    <span style={{ color: `var(${meta.colorVar})`, display: 'inline-flex', alignItems: 'center' }}>
      <CustomIcon type={type} size={size} />
    </span>
  );
};
