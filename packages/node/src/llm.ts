import OpenAI from 'openai';

import { loadConfig } from './config';
import { MythosError } from './errors';
import type { MythosSession } from './types';

export { getLlmBillingMetadata } from './billing-metadata';
export type { MythosLlmBillingMetadata } from './billing-metadata';

export interface LlmOptions<TFallback = never> {
  apiKey?: string;
  fallback?: TFallback;
  baseURL?: string;
  timeout?: number;
}

export function llm<TFallback = never>(
  session: MythosSession | null | undefined,
  options: LlmOptions<TFallback> = {},
): OpenAI | TFallback {
  if (!session) {
    if (options.fallback !== undefined) return options.fallback;
    throw new MythosError('An active Mythos session is required for LLM access', 'LLM_SESSION_REQUIRED');
  }
  // A session decoded before this release, or verified against an older backend, can be
  // real and active but still lack an identity token -- that's the same "can't reach
  // Mythos's LLM gateway" situation as no session at all, so it falls back the same way
  // rather than hard-throwing regardless of whether the caller configured one.
  if (!session.llmIdentityToken) {
    if (options.fallback !== undefined) return options.fallback;
    throw new MythosError('The Mythos session is missing its LLM identity token', 'LLM_IDENTITY_REQUIRED');
  }

  const baseURL = options.baseURL ?? `${loadConfig().apiUrl.replace(/\/+$/, '')}/v1`;
  try {
    return new OpenAI({
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      baseURL,
      defaultHeaders: { 'X-Mythos-Identity': `Bearer ${session.llmIdentityToken}` },
      ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    });
  } catch (err) {
    // Most commonly: no `apiKey` given and no OPENAI_API_KEY env var set, which the
    // underlying OpenAI client rejects with its own error type -- surfaced as a
    // MythosError instead, consistent with every other failure mode of this function.
    const message = err instanceof Error ? err.message : String(err);
    throw new MythosError(`Failed to construct the Mythos LLM client: ${message}`, 'LLM_CLIENT_CONSTRUCTION_ERROR');
  }
}
