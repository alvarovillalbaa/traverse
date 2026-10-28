import type { Driver } from './index.js';

/** A consumer-supplied Playwright Browser; Traverse never launches/closes it. */
export interface BrowserLike { newContext(): Promise<unknown> }
export interface PlaywrightDriverOptions {
  baseURL: string;
  signal?: AbortSignal;
  setupTimeoutMs?: number;
  defaultTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  maxObservationBytes?: number;
}
export function createPlaywrightDriver(browser: BrowserLike, options: PlaywrightDriverOptions): Promise<Driver>;
