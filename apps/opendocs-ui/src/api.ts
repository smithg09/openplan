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
