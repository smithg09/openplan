export type Theme = 'dark' | 'light' | 'system';

const ACCENT_COLORS: Record<string, { main: string; hover: string; subtle: string; fg: string }> = {
  '#0067bc': { main: '#0067bc', hover: '#0055a0', subtle: '#0a1e3a', fg: '#93c5fd' }, // sapphire
  '#6366f1': { main: '#6366f1', hover: '#4f46e5', subtle: '#1e1b4b', fg: '#c7d2fe' }, // indigo
  '#d946ef': { main: '#d946ef', hover: '#c026d3', subtle: '#3b0764', fg: '#f5d0fe' }, // magenta
  '#f59e0b': { main: '#f59e0b', hover: '#d97706', subtle: '#451a03', fg: '#fde68a' }, // amber
  '#22c55e': { main: '#22c55e', hover: '#16a34a', subtle: '#052e16', fg: '#bbf7d0' }, // green
};

export const ACCENT_OPTIONS = [
  { value: '#0067bc', label: 'Sapphire' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#d946ef', label: 'Magenta' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#22c55e', label: 'Green' },
];

export function applyTheme(theme: Theme, accent: string) {
  const root = document.documentElement;
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'dark' : 'light';
  } else {
    root.dataset.theme = theme;
  }

  const a = ACCENT_COLORS[accent] ?? ACCENT_COLORS['#0067bc'];
  root.style.setProperty('--accent', a.main);
  root.style.setProperty('--accent-hover', a.hover);
  root.style.setProperty('--accent-subtle', a.subtle);
  root.style.setProperty('--accent-fg', a.fg);
}

export function resolvedTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}
