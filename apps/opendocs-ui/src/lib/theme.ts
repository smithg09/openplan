export type Theme = 'dark' | 'light' | 'system';
const KEY = 'opendocs:theme';

export function savedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark';
  } catch { return 'dark'; }
}

/** The theme actually shown (system resolves via prefers-color-scheme). */
export function effectiveTheme(t: Theme): 'dark' | 'light' {
  if (t === 'system') return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return t;
}

export function applyTheme(t: Theme): 'dark' | 'light' {
  const eff = effectiveTheme(t);
  document.documentElement.setAttribute('data-theme', eff === 'light' ? 'light' : '');
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  return eff;
}
