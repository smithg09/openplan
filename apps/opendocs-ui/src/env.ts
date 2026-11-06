/**
 * Build-time switches.
 *
 * WEB: the static site build served at opendocs.smithgajjar.dev/app. There is no
 * Go server behind it, so documents opened locally live in the browser
 * (IndexedDB) and shared documents are fetched from a proxy directly.
 */
export const WEB = import.meta.env.VITE_WEB === 'true';

/** The hosted proxy used when none is configured. Matches the Go CLI's remote.HostedURL. */
export const DEFAULT_PROXY: string = (import.meta.env.VITE_DEFAULT_PROXY as string | undefined) || 'https://opendocs-proxy.onrender.com';

/** The hosted web app. Share links for the hosted proxy open here, on the project's own domain. */
export const APP_URL: string = (import.meta.env.VITE_APP_URL as string | undefined) || 'https://opendocs.smithgajjar.dev/app';

/**
 * The link to hand someone for a document on `proxy`. The hosted proxy is only a
 * backend, so its links go through the web app (which reaches it with ?proxy=);
 * a self-hosted proxy serves its own UI. The token stays in the fragment.
 */
export function capabilityLink(proxy: string, doc: string, token: string): string {
  const base = proxy.replace(/\/+$/, '');
  const frag = `#t=${encodeURIComponent(token)}`;
  const id = encodeURIComponent(doc);
  if (base === DEFAULT_PROXY.replace(/\/+$/, '')) return `${APP_URL.replace(/\/+$/, '')}/d/${id}?proxy=${encodeURIComponent(base)}${frag}`;
  return `${base}/d/${id}${frag}`;
}
