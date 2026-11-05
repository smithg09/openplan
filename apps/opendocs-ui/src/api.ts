// Typed client for the opendocs local server. Types mirror the Go JSON exactly
// (note the anchor uses start/end, not the shared type's startOffset/endOffset);
// conversion to the shared comment shape happens in adapt.ts.

export interface ApiAnchor {
  quote: string;
  prefix?: string;
  suffix?: string;
  start?: number;
  end?: number;
}

export interface ApiReaction {
  emoji: string;
  users: string[];
}

export interface ApiComment {
  id: string;
  anchor?: ApiAnchor;
  body: string;
  author?: string;
  createdOnVersionId: string;
  rootCommentId?: string;
  status: 'open' | 'resolved';
  reactions?: ApiReaction[];
  edited?: boolean;
  /** Proxy mode: whether the caller's token wrote this comment. */
  mine?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ApiVersion {
  id: string;
  parent?: string;
  contentHash: string;
  createdAt: string;
  label?: string;
  summary?: string;
}

export interface ApiSession {
  project: string;
  focus: string;
  version: string;
  mode: 'local' | 'proxy';
}

export interface ApiShare {
  id: string;
  role: Role;
  label?: string;
  createdAt: string;
}

export type Role = 'viewer' | 'commenter' | 'editor';

// ── capability token (proxy mode) ───────────────────────────────────────────
// Share links look like  /d/<docId>#t=<token>. The token rides in the URL
// fragment so it is never sent to a server, logged, or leaked via Referer. We
// move it into sessionStorage and strip it from the address bar immediately.
const tokenKey = (doc: string) => `opendocs:token:${doc}`;

/** Doc id from a /d/<id> path, or '' (local mode). */
export function docFromPath(): string {
  const m = /^\/d\/([^/]+)/.exec(window.location.pathname);
  return m ? decodeURIComponent(m[1]) : '';
}

/** Capture #t=<token> into sessionStorage for doc and remove it from the URL. */
export function captureToken(doc: string): void {
  const m = /(?:^#|&)t=([^&]+)/.exec(window.location.hash);
  if (!m) return;
  sessionStorage.setItem(tokenKey(doc), decodeURIComponent(m[1]));
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

let activeToken = '';
export function loadToken(doc: string): void {
  activeToken = doc ? sessionStorage.getItem(tokenKey(doc)) ?? '' : '';
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  // The server rejects any write that isn't application/json (this forces a CORS
  // preflight for cross-origin callers), so send it on every non-GET — even
  // body-less ones like DELETE and /session/done.
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  session: () => req<ApiSession>('GET', '/api/session'),
  submitReview: () => req('POST', '/api/session/done'),
  access: (doc: string) => req<{ role: Role }>('GET', `/api/docs/${encodeURIComponent(doc)}/access`),
  frameUrl: (doc: string, versionId: string) =>
    req<{ url: string }>('GET', `/api/docs/${encodeURIComponent(doc)}/versions/${versionId}/frame-url`),
  // Local mode: where "Share" publishes to, and what has been published.
  getSettings: () => req<{ proxy: string }>('GET', '/api/settings'),
  setSettings: (proxy: string) => req<{ proxy: string }>('POST', '/api/settings', { proxy }),
  remoteStatus: (doc: string) =>
    req<{ published: boolean; proxy?: string; id?: string }>('GET', `/api/docs/${encodeURIComponent(doc)}/remote`),
  publish: (doc: string, proxy?: string) =>
    req<{ id: string; proxy: string; new: boolean }>('POST', `/api/docs/${encodeURIComponent(doc)}/publish`, { proxy: proxy ?? '' }),
  remoteLink: (doc: string, role: Role) =>
    req<{ link: string; role: Role }>('POST', `/api/docs/${encodeURIComponent(doc)}/remote/links`, { role }),
  // Proxy mode (editors): manage this document's share links.
  listShares: (doc: string) =>
    req<{ shares: ApiShare[] }>('GET', `/api/docs/${encodeURIComponent(doc)}/shares`),
  mintShare: (doc: string, role: Role, label: string) =>
    req<{ token: string; role: Role; id: string }>('POST', `/api/docs/${encodeURIComponent(doc)}/shares`, { role, label }),
  revokeShare: (doc: string, id: string) =>
    req('DELETE', `/api/docs/${encodeURIComponent(doc)}/shares/${encodeURIComponent(id)}`),
  listDocs: () => req<{ docs: string[] | null }>('GET', '/api/docs'),
  listVersions: (doc: string) =>
    req<{ versions: ApiVersion[] | null }>('GET', `/api/docs/${encodeURIComponent(doc)}/versions`),
  listComments: (doc: string) =>
    req<{ comments: ApiComment[] | null }>('GET', `/api/docs/${encodeURIComponent(doc)}/comments`),
  addComment: (doc: string, c: Partial<ApiComment>) =>
    req<ApiComment>('POST', `/api/docs/${encodeURIComponent(doc)}/comments`, c),
  setStatus: (doc: string, id: string, status: 'open' | 'resolved') =>
    req('POST', `/api/docs/${encodeURIComponent(doc)}/comments/${id}/status`, { status }),
  editComment: (doc: string, id: string, bodyText: string) =>
    req('POST', `/api/docs/${encodeURIComponent(doc)}/comments/${id}/edit`, { body: bodyText }),
  react: (doc: string, id: string, emoji: string, user: string) =>
    req('POST', `/api/docs/${encodeURIComponent(doc)}/comments/${id}/react`, { emoji, user }),
  deleteComment: (doc: string, id: string) =>
    req('DELETE', `/api/docs/${encodeURIComponent(doc)}/comments/${id}`),
};

export function frameURL(doc: string, versionId: string): string {
  return `/api/docs/${encodeURIComponent(doc)}/versions/${versionId}/frame`;
}

export type LiveEvent = { type: 'comments' | 'versions' | 'presence'; count?: number };

/**
 * Subscribe to change notifications for a document (Server-Sent Events over
 * fetch, because EventSource cannot send the Authorization header). Events carry
 * no content — callers refetch through the normal API. Reconnects with backoff
 * until `signal` aborts. Returns once aborted.
 */
export async function subscribe(doc: string, onEvent: (e: LiveEvent) => void, signal: AbortSignal): Promise<void> {
  let delay = 1000;
  while (!signal.aborted) {
    try {
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
      const res = await fetch(`/api/docs/${encodeURIComponent(doc)}/events`, { headers, signal });
      if (res.status === 401 || res.status === 403) return; // not allowed: don't retry
      if (!res.ok || !res.body) throw new Error(String(res.status));
      delay = 1000;
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue; // keepalive comment
          try { onEvent(JSON.parse(line.slice(6)) as LiveEvent); } catch { /* ignore malformed */ }
        }
      }
    } catch {
      if (signal.aborted) return;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 15000);
  }
}
