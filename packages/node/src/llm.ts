import OpenAI from 'openai';

import { loadConfig } from './config';
import { MythosError } from './errors';
import type { MythosSession } from './types';

export interface LlmOptions<TFallback = never> {
  apiKey?: string;
  fallback?: TFallback;
  baseURL?: string;
  timeout?: number;
}

export interface MythosLlmBillingMetadata {
  mythos_cost_microunits: string | null;
  mythos_pricing_source: string;
  mythos_billing_status?: string;
  mythos_provider_cost_credits?: number;
  mythos_creator_margin_credits?: number;
  mythos_platform_fee_credits?: number;
  mythos_charge_credits?: number;
  mythos_creator_earning_credits?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return undefined;
  return value;
}

export function getLlmBillingMetadata(response: unknown): MythosLlmBillingMetadata | null {
  if (!isRecord(response)) return null;

  const hasCost = Object.prototype.hasOwnProperty.call(response, 'mythos_cost_microunits');
  const hasPricingSource = Object.prototype.hasOwnProperty.call(response, 'mythos_pricing_source');
  if (!hasCost || !hasPricingSource) return null;

  const cost = response['mythos_cost_microunits'];
  const pricingSource = response['mythos_pricing_source'];
  if ((typeof cost !== 'string' && cost !== null) || typeof pricingSource !== 'string') return null;

  const providerCostCredits = optionalNonNegativeInteger(response['mythos_provider_cost_credits']);
  const creatorMarginCredits = optionalNonNegativeInteger(response['mythos_creator_margin_credits']);
  const platformFeeCredits = optionalNonNegativeInteger(response['mythos_platform_fee_credits']);
  const chargeCredits = optionalNonNegativeInteger(response['mythos_charge_credits']);
  const creatorEarningCredits = optionalNonNegativeInteger(response['mythos_creator_earning_credits']);

  return {
    mythos_cost_microunits: cost,
    mythos_pricing_source: pricingSource,
    ...(typeof response['mythos_billing_status'] === 'string'
      ? { mythos_billing_status: response['mythos_billing_status'] }
      : {}),
    ...(providerCostCredits !== undefined ? { mythos_provider_cost_credits: providerCostCredits } : {}),
    ...(creatorMarginCredits !== undefined ? { mythos_creator_margin_credits: creatorMarginCredits } : {}),
    ...(platformFeeCredits !== undefined ? { mythos_platform_fee_credits: platformFeeCredits } : {}),
    ...(chargeCredits !== undefined ? { mythos_charge_credits: chargeCredits } : {}),
    ...(creatorEarningCredits !== undefined ? { mythos_creator_earning_credits: creatorEarningCredits } : {}),
  };
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
