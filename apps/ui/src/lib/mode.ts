import { SAMPLE_PLAN } from '@openplan/shared';
import { isShareHash } from './share';
export { SAMPLE_PLAN };
export type AppMode = 'hook' | 'standalone' | 'share';

export const IS_GITHUB_PAGES = import.meta.env.VITE_GITHUB_PAGES === 'true';

declare global {
  interface Window {
    __OPENPLAN_MODE__?: AppMode;
    __OPENPLAN_PLAN__?: string;
    __OPENPLAN_SLUG__?: string;
    __OPENPLAN_PROJECT__?: string;
    __OPENPLAN_VERSION__?: number;
    __OPENPLAN_PID__?: number;
    __OPENPLAN_PORT__?: number;
    __OPENPLAN_TITLE__?: string;
    __OPENPLAN_SHARE_HASH__?: string;
  }
}

export function isShareMode(): boolean {
  return isShareHash(window.location.hash);
}

export function getMode(): AppMode {
  if (isShareMode()) return 'share';
  return window.__OPENPLAN_MODE__ ?? 'hook';
}

export function getInitialPlan(): string {
  return window.__OPENPLAN_PLAN__ ?? SAMPLE_PLAN;
}

export function getInitialMeta() {
  return {
    slug: window.__OPENPLAN_SLUG__ ?? 'untitled',
    project: window.__OPENPLAN_PROJECT__ ?? 'untitled',
    version: window.__OPENPLAN_VERSION__ ?? 1,
    pid: window.__OPENPLAN_PID__ ?? 0,
    title: window.__OPENPLAN_TITLE__ ?? 'Untitled Plan',
  };
}
