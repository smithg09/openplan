// Optional accounts (Neon Auth, managed Better Auth). Entirely off unless the web
// build is given VITE_NEON_AUTH_URL: anonymous use, capability links and browser-local
// documents work exactly as before. Signing in adds an identity on the proxy: published
// documents belong to the account and comments carry the verified name.
import { createAuthClient } from '@neon/auth';
import { WEB } from './env';

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;
export const accountsEnabled: boolean = WEB && !!AUTH_URL;

export interface AccountUser { id: string; email: string; name: string }

interface Result<T> { data?: T | null; error?: { message?: string } | null }
interface Client {
  signUp: { email(a: { email: string; password: string; name: string }): Promise<Result<unknown>> };
  signIn: {
    email(a: { email: string; password: string }): Promise<Result<unknown>>;
    social(a: { provider: string; callbackURL: string }): Promise<Result<unknown>>;
  };
  signOut(): Promise<unknown>;
  getSession(): Promise<Result<{ user?: { id: string; email: string; name?: string } }>>;
  token(): Promise<Result<{ token: string }>>;
}

const client: Client | null = accountsEnabled ? (createAuthClient(AUTH_URL!) as unknown as Client) : null;

function need(): Client {
  if (!client) throw new Error('accounts are not enabled in this build');
  return client;
}

const fail = (r: Result<unknown>, fallback: string): never => { throw new Error(r.error?.message || fallback); };

export async function currentUser(): Promise<AccountUser | null> {
  if (!client) return null;
  try {
    const u = (await client.getSession()).data?.user;
    return u ? { id: u.id, email: u.email, name: u.name || u.email.split('@')[0] } : null;
  } catch {
    return null;
  }
}

export async function signUp(name: string, email: string, password: string): Promise<void> {
  const r = await need().signUp.email({ name, email, password });
  if (r.error) fail(r, 'Could not create the account');
}

export async function signIn(email: string, password: string): Promise<void> {
  const r = await need().signIn.email({ email, password });
  if (r.error) fail(r, 'Could not sign in');
}

/** Redirects to the provider and back to this page, where the session is picked up on load. */
export async function signInWithProvider(provider: 'github'): Promise<void> {
  const r = await need().signIn.social({ provider, callbackURL: window.location.href });
  if (r.error) fail(r, 'Could not start sign-in');
}

export async function signOut(): Promise<void> {
  tokenCache = null;
  await need().signOut();
}

// The token Neon Auth issues is short-lived (15 minutes): fetch a fresh one rather
// than holding it for the session, and reuse it only briefly.
let tokenCache: { token: string; at: number } | null = null;

/** A current user token for the proxy, or '' when signed out. */
export async function userToken(): Promise<string> {
  if (!client) return '';
  if (tokenCache && Date.now() - tokenCache.at < 10 * 60_000) return tokenCache.token;
  try {
    const t = (await client.token()).data?.token ?? '';
    tokenCache = t ? { token: t, at: Date.now() } : null;
    return t;
  } catch {
    return '';
  }
}

export const USER_HEADER = 'X-Opendocs-User';
