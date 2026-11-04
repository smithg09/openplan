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
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
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
