import { DEFAULT_PROXY, WEB } from './env';

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
  type?: 'comment' | 'question' | 'suggestion' | 'deletion' | 'emoji';
  suggestion?: string;
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

export interface SearchHit { doc: string; title: string; versionId: string; snippet: string; score: number }

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
  const m = /\/d\/([^/]+)/.exec(window.location.pathname); // /d/<id> (proxy) or /app/d/<id> (web app)
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

// Where the HTTP API lives. '' = same origin (the Go server or a proxy serving this
// UI). In the hosted web app a shared document is read from a proxy origin.
let apiBase = '';
export function setApiBase(base: string): void { apiBase = base.replace(/\/$/, ''); }
/** Where the current page's API lives, for remembering a shared document. */
export function currentApiBase(): string { return apiBase; }
export function currentToken(): string { return activeToken; }
export function shareOrigin(): string { return apiBase || window.location.origin; }
const resolve = (p: string) => apiBase + p;

let httpMode: 'local' | 'proxy' = 'local';
let liveEnabled = true;

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  // The server rejects any write that isn't application/json (this forces a CORS
  // preflight for cross-origin callers), so send it on every non-GET — even
  // body-less ones like DELETE and /session/done.
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
  const res = await fetch(resolve(url), {
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

export const httpApi = {
  session: async () => { const s = await req<ApiSession>('GET', '/api/session'); httpMode = s.mode; return s; },
  /** Bridge-injected HTML for the sandbox. Fetched as text: the iframe never makes its own request. */
  frameHtml: async (doc: string, versionId: string): Promise<string> => {
    let path = frameURL(doc, versionId);
    if (httpMode === 'proxy') path = (await req<{ url: string }>('GET', `/api/docs/${encodeURIComponent(doc)}/versions/${versionId}/frame-url`)).url;
    const res = await fetch(resolve(path));
    if (!res.ok) throw new Error(`document failed to load (${res.status})`);
    return res.text();
  },
  access: (doc: string) => req<{ role: Role }>('GET', `/api/docs/${encodeURIComponent(doc)}/access`),
  frameUrl: (doc: string, versionId: string) =>
    req<{ url: string }>('GET', `/api/docs/${encodeURIComponent(doc)}/versions/${versionId}/frame-url`),
  // Local mode: where "Share" publishes to, and what has been published.
  getSettings: () => req<{ proxy: string }>('GET', '/api/settings'),
  setSettings: (proxy: string) => req<{ proxy: string }>('POST', '/api/settings', { proxy }),
  remoteStatus: (doc: string) =>
    req<{ published: boolean; proxy?: string; id?: string }>('GET', `/api/docs/${encodeURIComponent(doc)}/remote`),
  publish: (doc: string, proxy?: string) =>
    req<{ id: string; proxy: string; new: boolean; comments?: number; commentsError?: string }>('POST', `/api/docs/${encodeURIComponent(doc)}/publish`, { proxy: proxy ?? '' }),
  remoteLink: (doc: string, role: Role) =>
    req<{ link: string; role: Role }>('POST', `/api/docs/${encodeURIComponent(doc)}/remote/links`, { role }),
  // Proxy mode (editors): manage this document's share links.
  listShares: (doc: string) =>
    req<{ shares: ApiShare[] }>('GET', `/api/docs/${encodeURIComponent(doc)}/shares`),
  mintShare: (doc: string, role: Role, label: string) =>
    req<{ token: string; role: Role; id: string }>('POST', `/api/docs/${encodeURIComponent(doc)}/shares`, { role, label }),
  revokeShare: (doc: string, id: string) =>
    req('DELETE', `/api/docs/${encodeURIComponent(doc)}/shares/${encodeURIComponent(id)}`),
  createVersion: (doc: string, body: { html: string; label?: string; summary?: string; expectedHead?: string }) =>
    req<ApiVersion>('POST', `/api/docs/${encodeURIComponent(doc)}/versions`, body),
  restoreVersion: (doc: string, id: string, expectedHead?: string) =>
    req<ApiVersion>('POST', `/api/docs/${encodeURIComponent(doc)}/versions/${id}/restore`, { expectedHead: expectedHead ?? '' }),
  /** Original HTML of a version (no bridge) — used for download/export. */
  rawVersion: async (doc: string, id: string): Promise<string> => {
    const headers: Record<string, string> = {};
    if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
    const res = await fetch(resolve(`/api/docs/${encodeURIComponent(doc)}/versions/${id}/raw`), { headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  },
  sample: () => req<{ slug: string; html: string }>('GET', '/api/sample'),
  listDocs: () => req<{ docs: string[] | null }>('GET', '/api/docs'),
  deleteDoc: (doc: string) => req<{ ok: boolean }>('DELETE', `/api/docs/${encodeURIComponent(doc)}`),
  search: (q: string) => req<{ results: SearchHit[] | null }>('GET', `/api/search?q=${encodeURIComponent(q)}`),
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
  if (!liveEnabled) return; // browser-local documents have no other viewers
  let delay = 1000;
  while (!signal.aborted) {
    try {
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
      const res = await fetch(resolve(`/api/docs/${encodeURIComponent(doc)}/events`), { headers, signal });
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

// ── backend switch ──────────────────────────────────────────────────────────
// The UI talks to `api`. It is the HTTP client by default; the hosted web app
// swaps in a browser-local store for documents that live only on this device.
export type Api = typeof httpApi;
let impl: Api = httpApi;
export const api: Api = new Proxy({} as Api, { get: (_t, k) => (impl as unknown as Record<string | symbol, unknown>)[k] });

/**
 * Decide where this page's data comes from and return the session.
 *  - server build (Go local server or a proxy's own UI): same-origin HTTP.
 *  - web build, /d/<id> link: a proxy, over HTTP with CORS (?proxy= or the hosted default).
 *  - web build, anything else: documents stored in this browser.
 */
export async function bootstrap(): Promise<ApiSession> {
  if (!WEB) return httpApi.session();
  const q = new URLSearchParams(window.location.search);
  if (docFromPath()) {
    setApiBase(normalizeProxy(q.get('proxy') || DEFAULT_PROXY));
    return httpApi.session();
  }
  const { webLocalApi } = await import('./webstore');
  impl = webLocalApi;
  liveEnabled = false;
  return { project: 'browser', focus: q.get('doc') ?? '', version: 'web', mode: 'local' };
}

/** Accept https (or http on localhost) and return the bare origin. */
export function normalizeProxy(raw: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error(`invalid proxy URL: ${raw}`); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new Error('the proxy URL must be https (http is only allowed for localhost)');
  if (u.username || u.password) throw new Error('credentials in the proxy URL are not allowed');
  return u.origin;
}
