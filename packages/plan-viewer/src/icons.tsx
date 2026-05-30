import React from 'react';

export const ANNOTATION_TYPES: Record<string, { label: string; colorVar: string; letter: string }> = {
  comment:       { label: 'Comment',  colorVar: '--comment',    letter: 'C' },
  question:      { label: 'Question', colorVar: '--question',   letter: 'Q' },
  highlight:     { label: 'Highlight',colorVar: '--highlight',  letter: 'H' },
  approval:      { label: 'Approve',  colorVar: '--approval',   letter: 'A' },
  emoji:         { label: 'Reaction', colorVar: '--text-muted', letter: 'E' },
  deletion:      { label: 'Delete',   colorVar: '--danger',     letter: 'D' },
  suggestion:    { label: 'Suggest',  colorVar: '--teal',       letter: 'S' },
  'action-item': { label: 'Action',   colorVar: '--warning',    letter: 'T' },
};

export const CustomIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 12 }) => {
  const props = {
    width: size, height: size, viewBox: '0 0 16 16',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.4,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (type) {
    case 'comment':
      return <svg {...props}><path d="M2.5 4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 4v5A1.5 1.5 0 0 1 12 10.5H6.5L4 13v-2.5a1.5 1.5 0 0 1-1.5-1.5z" /><circle cx="6" cy="6.5" r=".5" fill="currentColor" stroke="none" /><circle cx="8" cy="6.5" r=".5" fill="currentColor" stroke="none" /><circle cx="10" cy="6.5" r=".5" fill="currentColor" stroke="none" /></svg>;
    case 'question':
      return <svg {...props}><rect x="2" y="2" width="12" height="12" rx="3" /><path d="M6 6.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.6-.8 1.2v.3" /><circle cx="8" cy="11.5" r=".55" fill="currentColor" stroke="none" /></svg>;
    case 'highlight':
      return <svg {...props}><path d="M9.5 2.5l4 4-6 6-3 1 1-3z" /><path d="M7.5 4.5l4 4" /><path d="M2.5 13.5h11" strokeWidth="2" opacity=".5" /></svg>;
    case 'approval':
      return <svg {...props} strokeWidth={2}><path d="M3 8.5l3.5 3.5L13 5.5" /></svg>;
    case 'emoji':
      return <svg {...props}><circle cx="8" cy="8" r="5.5" /><circle cx="6" cy="7" r=".7" fill="currentColor" stroke="none" /><circle cx="10" cy="7" r=".7" fill="currentColor" stroke="none" /><path d="M5.5 9.5c.6 1 1.4 1.5 2.5 1.5s1.9-.5 2.5-1.5" /></svg>;
    case 'deletion':
      return <svg {...props}><path d="M3 4.5h10" /><path d="M6 4.5V3a.5.5 0 0 1 .5-.5h3A.5.5 0 0 1 10 3v1.5" /><path d="M4.5 4.5l.6 8.5a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8.5" /><path d="M6.5 7v4M9.5 7v4" /></svg>;
    case 'suggestion':
      return <svg {...props}><path d="M2.5 5h6" strokeWidth="1.8" /><path d="M2.5 11h6" strokeWidth="1.8" /><path d="M10 5h3.5M10 11h3.5" opacity=".4" /><path d="M11 7l-1.5 1L11 9" /></svg>;
    case 'action-item':
      return <svg {...props}><rect x="2.5" y="2.5" width="11" height="11" rx="2.2" /><path d="M5.5 8.5l1.8 1.8 3.2-3.6" strokeWidth="1.6" /></svg>;
    default:
      return null;
  }
};

export const AnnoIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 12 }) => {
  const meta = ANNOTATION_TYPES[type] ?? ANNOTATION_TYPES['comment'];
  return (
    <span style={{ color: `var(${meta.colorVar})`, display: 'inline-flex', alignItems: 'center' }}>
      <CustomIcon type={type} size={size} />
    </span>
  );
};
