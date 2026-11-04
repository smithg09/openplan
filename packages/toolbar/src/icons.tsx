import React from 'react';
import {
  MessageSquareText,
  CircleHelp,
  Lightbulb,
  Trash2,
  Smile,
  Highlighter,
  Check,
  SquareCheck,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

export const ANNOTATION_TYPES: Record<string, { label: string; colorVar: string; letter: string }> = {
  comment:    { label: 'Comment',  colorVar: '--comment',    letter: 'C' },
  deletion:   { label: 'Delete',   colorVar: '--danger',     letter: 'D' },
  suggestion: { label: 'Suggest',  colorVar: '--teal',       letter: 'S' },
  question:   { label: 'Question', colorVar: '--question',   letter: 'Q' },
  emoji:      { label: 'Reaction', colorVar: '--text-muted', letter: 'E' },
};

// Annotation type → lucide icon. Swapped from hand-rolled SVGs to a maintained
// icon library (lucide-react) while keeping the AnnoIcon/CustomIcon API stable.
const ICONS: Record<string, LucideIcon> = {
  comment:       MessageSquareText,
  question:      CircleHelp,
  suggestion:    Lightbulb,
  deletion:      Trash2,
  emoji:         Smile,
  highlight:     Highlighter,
  approval:      Check,
  'action-item': SquareCheck,
};

export const CustomIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 12 }) => {
  const Icon = ICONS[type] ?? MessageSquare;
  return <Icon size={size} strokeWidth={1.6} aria-hidden />;
};

export const AnnoIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 12 }) => {
  const meta = ANNOTATION_TYPES[type] ?? ANNOTATION_TYPES['comment'];
  return (
    <span style={{ color: `var(${meta.colorVar})`, display: 'inline-flex', alignItems: 'center' }}>
      <CustomIcon type={type} size={size} />
    </span>
  );
};
