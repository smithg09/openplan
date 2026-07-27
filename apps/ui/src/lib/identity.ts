const KEY = 'openplan:author';

export function getAuthor(): string | null {
  return localStorage.getItem(KEY);
}

export function setAuthor(name: string): void {
  localStorage.setItem(KEY, name);
}
