import type { Executor } from './index.js';

export interface OpenAIExecutorOptions {
  /** Explicit credential; never discovered from the environment. */
  apiKey: string;
  /** Explicit model supporting Responses structured outputs. No default model. */
  model: string;
  /** Defaults to https://api.openai.com/v1/responses. No redirects are followed. */
  endpoint?: string;
  /** Allows HTTP only to literal 127.0.0.1 / [::1], for authored local fixtures. */
  allowLocalHTTP?: boolean;
  /** Explicit fetch-compatible transport; otherwise uses the host's fetch. */
  fetch?: typeof globalThis.fetch;
  /** Requests per executor invocation, 1–20; default 6. No retries. */
  maxRequests?: number;
  /** Output token limit per request, 1–4096; default 512. Not a billing limit. */
  maxOutputTokens?: number;
}
export function createOpenAIExecutor(options: OpenAIExecutorOptions): Executor;
