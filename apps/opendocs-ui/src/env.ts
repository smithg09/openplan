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
