// Documents opened through a share link in the hosted web app. The link's token is the
// only way back in, so it is kept (in this browser only) to let people continue later.
// Removing an entry forgets the token.

const KEY = 'opendocs:shared';

export interface SharedDoc {
  id: string;
  proxy: string;
  token: string;
  role: string;
  title: string;
  at: number;
}

export function listShared(): SharedDoc[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]') as SharedDoc[];
    return Array.isArray(v) ? v.sort((a, b) => b.at - a.at) : [];
  } catch {
    return [];
  }
}

function save(list: SharedDoc[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50))); } catch { /* storage full or blocked */ }
}

export function rememberShared(d: Omit<SharedDoc, 'at'>): void {
  if (!d.token) return;
  const rest = listShared().filter((x) => !(x.id === d.id && x.proxy === d.proxy));
  const prev = listShared().find((x) => x.id === d.id && x.proxy === d.proxy);
  save([{ ...d, title: d.title || prev?.title || '', at: Date.now() }, ...rest]);
}

export function forgetShared(id: string, proxy: string): void {
  save(listShared().filter((x) => !(x.id === id && x.proxy === proxy)));
}

/** URL that reopens the document in the web app. */
export function sharedHref(d: SharedDoc): string {
  return `${import.meta.env.BASE_URL}d/${encodeURIComponent(d.id)}?proxy=${encodeURIComponent(d.proxy)}#t=${encodeURIComponent(d.token)}`;
}
