import React from 'react';

// GitHub icon
export const GithubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

// Sun icon (light mode indicator)
export const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
  </svg>
);

// Moon icon (dark mode indicator)
export const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M13.5 10.5A6 6 0 0 1 5.5 2.5a6 6 0 1 0 8 8z" />
  </svg>
);

// Terminal icon (Claude Code)
export const TerminalIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
    <path d="M4.5 5.5l2.5 2.5-2.5 2.5" />
    <path d="M9 10.5h2.5" />
  </svg>
);

// Code2 icon (Codex)
export const Code2Icon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4L1 8l4 4" />
    <path d="M11 4l4 4-4 4" />
    <path d="M9 2l-2 12" />
  </svg>
);

// Bot icon (Copilot)
export const BotIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="12" height="8" rx="2" />
    <path d="M8 2v3" />
    <circle cx="8" cy="2" r="1" />
    <circle cx="5.5" cy="9" r="1" fill={color} stroke="none" />
    <circle cx="10.5" cy="9" r="1" fill={color} stroke="none" />
    <path d="M5.5 11.5c.7.7 1.3 1 2.5 1s1.8-.3 2.5-1" />
  </svg>
);

// Zap icon (Antigravity CLI)
export const ZapIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 1.5L3 9h5l-1.5 5.5L14 7H9l.5-5.5z" />
  </svg>
);

// Layout icon (VS Code)
export const LayoutIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2" width="13" height="12" rx="1.5" />
    <path d="M1.5 6h13" />
    <path d="M6 6v8" />
  </svg>
);

// Check icon for decision overlay
export const CheckIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12l5.5 5.5L20 6" />
  </svg>
);

// Undo icon for denied
export const UndoIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v6h6" />
    <path d="M3 13c1.7-4.3 5.8-7 10.5-7A10.5 10.5 0 0 1 21 17" />
  </svg>
);

// Copy icon
export const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="5" y="5" width="8" height="9" rx="1.5" />
    <path d="M3 10V3.5A1.5 1.5 0 0 1 4.5 2H11" />
  </svg>
);

// Check (copied) icon
export const CheckSmIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 8.5l3.5 3.5L13 5" />
  </svg>
);

// Annotation tool icons (matching packages/toolbar/src/icons.tsx)
export const CommentSVG = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 4v5A1.5 1.5 0 0 1 12 10.5H6.5L4 13v-2.5a1.5 1.5 0 0 1-1.5-1.5z" />
    <circle cx="6" cy="6.5" r=".5" fill={c} stroke="none" />
    <circle cx="8" cy="6.5" r=".5" fill={c} stroke="none" />
    <circle cx="10" cy="6.5" r=".5" fill={c} stroke="none" />
  </svg>
);
export const TrashSVG = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4.5h10M6 4.5V3a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1.5" />
    <path d="M4.5 4.5l.6 8.5a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8.5" />
    <path d="M6.5 7v4M9.5 7v4" />
  </svg>
);
export const PenSVG = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 2.5l3.5 3.5-7.5 7.5H2.5v-3.5L10 2.5z" />
    <path d="M8.5 4l3 3" strokeWidth="1.2" opacity=".55" />
  </svg>
);
export const QSvg = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="12" height="12" rx="3" />
    <path d="M6 6.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.6-.8 1.2v.3" />
    <circle cx="8" cy="11.5" r=".55" fill={c} stroke="none" />
  </svg>
);
export const SmileySVG = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="5.5" />
    <circle cx="6" cy="7" r=".7" fill={c} stroke="none" />
    <circle cx="10" cy="7" r=".7" fill={c} stroke="none" />
    <path d="M5.5 9.5c.6 1 1.4 1.5 2.5 1.5s1.9-.5 2.5-1.5" />
  </svg>
);
