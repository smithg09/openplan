// Browser-local backend for the hosted web app (opendocs.smithgajjar.dev/app).
//
// Documents opened here — the sample, files imported from a folder you pick,
// uploads — live in IndexedDB on this device and never leave it unless you
// publish them to a proxy. It implements the same surface as the HTTP client so
// the UI does not know which one it is talking to.
import sampleHTML from '../../cli/internal/opendocs/sample/retry-storm.html?raw';
import { DEFAULT_PROXY, capabilityLink } from './env';
import { buildFrame } from './frame';
import { htmlText, htmlTitle } from './lib/htmlmeta';
import { normalizeProxy, type SearchHit, type Api, type ApiComment, type ApiVersion, type Role } from './api';

const DB = 'opendocs-web';
const SAMPLE_SLUG = 'retry-storm';

interface VersionRow extends ApiVersion { key: string; slug: string; html: string }
interface CommentRow extends ApiComment { key: string; slug: string }
interface Meta { k: string; v: unknown }

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('versions', { keyPath: 'key' }).createIndex('slug', 'slug');
      d.createObjectStore('comments', { keyPath: 'key' }).createIndex('slug', 'slug');
      d.createObjectStore('docs', { keyPath: 'slug' });
      d.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('could not open browser storage'));
  });
  return dbp;
}

const done = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function store(name: string, mode: IDBTransactionMode = 'readonly') {
  return (await db()).transaction(name, mode).objectStore(name);
}
const getAll = async <T,>(name: string, slug: string) => done<T[]>((await store(name)).index('slug').getAll(slug) as IDBRequest<T[]>);
const put = async (name: string, row: unknown) => { await done(await (await store(name, 'readwrite')).put(row)); };
const del = async (name: string, key: string) => { await done(await (await store(name, 'readwrite')).delete(key)); };
const meta = async <T,>(k: string): Promise<T | undefined> => (await done<Meta | undefined>((await store('meta')).get(k) as IDBRequest<Meta | undefined>))?.v as T | undefined;
const setMeta = (k: string, v: unknown) => put('meta', { k, v });

const rid = () => 'v_' + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const strip = (v: VersionRow): ApiVersion => { const { key: _k, slug: _s, html: _h, ...rest } = v; return rest; };
async function versionsOf(slug: string): Promise<VersionRow[]> {
  return (await getAll<VersionRow>('versions', slug)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

async function addVersion(slug: string, html: string, label = '', summary = '', expectedHead?: string): Promise<ApiVersion> {
  const vs = await versionsOf(slug);
  const head = vs[vs.length - 1];
  if (expectedHead && expectedHead !== head?.id) throw new Error(`version conflict: expected head ${expectedHead}`);
  const id = rid();
  const row: VersionRow = { key: `${slug}/${id}`, slug, id, parent: head?.id, contentHash: await sha256(html), createdAt: now(), label, summary, html };
  await put('versions', row);
  await put('docs', { slug });
  return strip(row);
}

async function seedSampleOnce() {
  if (await meta<boolean>('seeded')) return;
  if ((await versionsOf(SAMPLE_SLUG)).length === 0) await addVersion(SAMPLE_SLUG, sampleHTML, 'sample');
  await setMeta('seeded', true);
}

// ── sharing: browser → proxy, over CORS ─────────────────────────────────────
interface Published { proxy: string; id: string; editorToken: string; comments?: Record<string, string> }

class ProxyError extends Error { constructor(msg: string, readonly status: number) { super(msg); } }
const gone = (e: unknown) => e instanceof ProxyError && (e.status === 401 || e.status === 404);

async function proxyCall<T>(base: string, method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error(`could not reach ${base} — is it running, and does it allow ${location.origin}? (proxy flag: --cors-origin)`);
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new ProxyError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

async function configuredProxy(): Promise<string> {
  return (await meta<string>('proxy')) || DEFAULT_PROXY;
}

/** Send comments the proxy hasn't seen (threads before replies) so the shared link shows the review so far. */
async function syncComments(doc: string, pub: Published): Promise<{ comments: number; commentsError?: string }> {
  const done: Record<string, string> = { ...(pub.comments ?? {}) };
  const all = (await getAll<CommentRow>('comments', doc)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let sent = 0;
  let error: string | undefined;
  try {
    for (const c of [...all.filter((x) => !x.rootCommentId), ...all.filter((x) => x.rootCommentId)]) {
      if (done[c.id]) continue;
      let root: string | undefined;
      if (c.rootCommentId) { root = done[c.rootCommentId]; if (!root) continue; }
      const saved = await proxyCall<{ id: string }>(pub.proxy, 'POST', `/api/docs/${encodeURIComponent(pub.id)}/comments`, pub.editorToken, {
        body: c.body, type: c.type, suggestion: c.suggestion, anchor: c.anchor, author: c.author, createdOnVersionId: c.createdOnVersionId, rootCommentId: root, status: 'open',
      });
      done[c.id] = saved.id;
      sent++;
      if (c.status === 'resolved') await proxyCall(pub.proxy, 'POST', `/api/docs/${encodeURIComponent(pub.id)}/comments/${encodeURIComponent(saved.id)}/status`, pub.editorToken, { status: 'resolved' }).catch(() => {});
    }
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  await setMeta(`published:${doc}`, { ...pub, comments: done } satisfies Published);
  return error ? { comments: sent, commentsError: error } : { comments: sent };
}

export const webLocalApi: Api = {
  session: async () => ({ project: 'browser', focus: '', version: 'web', mode: 'local' as const }),
  access: async () => ({ role: 'editor' as Role }),
  frameUrl: async () => { throw new Error('not used in the browser-local backend'); },
  frameHtml: async (doc, versionId) => {
    const v = (await versionsOf(doc)).find((x) => x.id === versionId);
    if (!v) throw new Error('version not found');
    return buildFrame(v.html);
  },

  listDocs: async () => {
    await seedSampleOnce();
    const all = await done<{ slug: string }[]>((await store('docs')).getAll() as IDBRequest<{ slug: string }[]>);
    return { docs: all.map((d) => d.slug).sort() };
  },
  deleteDoc: async (doc) => {
    for (const v of await versionsOf(doc)) await del('versions', v.key);
    for (const c of await getAll<CommentRow>('comments', doc)) await del('comments', c.key);
    await del('docs', doc);
    await del('meta', `published:${doc}`);
    return { ok: true };
  },
  search: async (q) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const results: SearchHit[] = [];
    const slugs = (await done<{ slug: string }[]>((await store('docs')).getAll() as IDBRequest<{ slug: string }[]>)).map((d) => d.slug);
    for (const slug of slugs) {
      const head = (await versionsOf(slug)).pop();
      if (!head) continue;
      const title = htmlTitle(head.html, slug);
      const text = htmlText(head.html);
      const hay = `${title} ${text}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      const at = words.length ? text.toLowerCase().indexOf(words[0]) : -1;
      const snippet = at < 0 ? '' : (at > 40 ? '…' : '') + text.slice(Math.max(0, at - 40), at + 110) + '…';
      results.push({ doc: slug, title, versionId: head.id, snippet, score: words.reduce((n, w) => n + (title.toLowerCase().includes(w) ? 3 : 1), 0) });
    }
    return { results: results.sort((a, b) => b.score - a.score) };
  },
  listVersions: async (doc) => ({ versions: (await versionsOf(doc)).map(strip) }),
  createVersion: (doc, b) => addVersion(doc, b.html, b.label, b.summary, b.expectedHead),
  restoreVersion: async (doc, id, expectedHead) => {
    const v = (await versionsOf(doc)).find((x) => x.id === id);
    if (!v) throw new Error('version not found');
    return addVersion(doc, v.html, '', `Restored from ${id}`, expectedHead || undefined);
  },
  rawVersion: async (doc, id) => {
    const v = (await versionsOf(doc)).find((x) => x.id === id);
    if (!v) throw new Error('version not found');
    return v.html;
  },
  sample: async () => ({ slug: SAMPLE_SLUG, html: sampleHTML }),

  listComments: async (doc) => ({ comments: (await getAll<CommentRow>('comments', doc)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(({ key: _k, slug: _s, ...c }) => ({ ...c, mine: true })) }),
  addComment: async (doc, c) => {
    const id = rid();
    const row: CommentRow = { key: `${doc}/${id}`, slug: doc, id, body: c.body ?? '', type: c.type, suggestion: c.suggestion, anchor: c.anchor, author: c.author, createdOnVersionId: c.createdOnVersionId ?? '', rootCommentId: c.rootCommentId, status: 'open', createdAt: now() };
    await put('comments', row);
    await put('docs', { slug: doc });
    const { key: _k, slug: _s, ...out } = row;
    return { ...out, mine: true };
  },
  setStatus: async (doc, id, status) => { await patchComment(doc, id, (c) => { c.status = status; }); },
  editComment: async (doc, id, body) => { await patchComment(doc, id, (c) => { c.body = body; c.edited = true; }); },
  react: async (doc, id, emoji, user) => {
    await patchComment(doc, id, (c) => {
      const rs = c.reactions ?? [];
      const r = rs.find((x) => x.emoji === emoji);
      if (!r) rs.push({ emoji, users: [user] });
      else if (r.users.includes(user)) r.users = r.users.filter((u) => u !== user);
      else r.users.push(user);
      c.reactions = rs.filter((x) => x.users.length > 0);
    });
  },
  deleteComment: async (doc, id) => {
    for (const c of await getAll<CommentRow>('comments', doc)) if (c.id === id || c.rootCommentId === id) await del('comments', c.key);
  },

  getSettings: async () => ({ proxy: await configuredProxy() }),
  setSettings: async (proxy) => {
    const p = proxy.trim() ? normalizeProxy(proxy) : '';
    await setMeta('proxy', p);
    return { proxy: p || DEFAULT_PROXY };
  },
  remoteStatus: async (doc) => {
    const p = await meta<Published>(`published:${doc}`);
    return p ? { published: true, proxy: p.proxy, id: p.id } : { published: false };
  },
  publish: async (doc, proxyArg) => {
    const vs = await versionsOf(doc);
    const head = vs[vs.length - 1];
    if (!head) throw new Error('this document has no versions to publish');
    const proxy = normalizeProxy(proxyArg?.trim() || (await configuredProxy()));
    const prev = await meta<Published>(`published:${doc}`);
    if (prev && prev.proxy === proxy) {
      try {
        await proxyCall(proxy, 'POST', `/api/docs/${encodeURIComponent(prev.id)}/versions`, prev.editorToken, { html: head.html, label: head.label ?? '', summary: '' });
        return { id: prev.id, proxy, new: false, ...(await syncComments(doc, prev)) };
      } catch (e) {
        if (!gone(e)) throw e; // otherwise the proxy lost this document (e.g. its storage was reset): publish afresh below
      }
    }
    const created = await proxyCall<{ id: string; editorToken: string }>(proxy, 'POST', '/api/docs', null, { html: head.html, label: head.label ?? '', summary: '' });
    // The editor token is kept in this browser's storage (there is no server to hold it).
    const pub: Published = { proxy, id: created.id, editorToken: created.editorToken };
    await setMeta(`published:${doc}`, pub);
    return { id: created.id, proxy, new: true, ...(await syncComments(doc, pub)) };
  },
  remoteLink: async (doc, role) => {
    const p = await meta<Published>(`published:${doc}`);
    if (!p) throw new Error('publish this document first');
    let r: { token: string };
    try {
      r = await proxyCall<{ token: string }>(p.proxy, 'POST', `/api/docs/${encodeURIComponent(p.id)}/shares`, p.editorToken, { role, label: `${role} link` });
    } catch (e) {
      if (gone(e)) throw new Error('This document is no longer on the proxy — click “Publish latest version” to publish it again.');
      throw e;
    }
    return { link: capabilityLink(p.proxy, p.id, r.token), role };
  },
  listShares: async () => ({ shares: [] }),
  mintShare: async () => { throw new Error('manage links from the shared document'); },
  revokeShare: async () => { throw new Error('manage links from the shared document'); },
};

async function patchComment(doc: string, id: string, f: (c: CommentRow) => void): Promise<void> {
  const row = (await getAll<CommentRow>('comments', doc)).find((c) => c.id === id);
  if (!row) throw new Error('comment not found');
  f(row);
  row.updatedAt = now();
  await put('comments', row);
}
