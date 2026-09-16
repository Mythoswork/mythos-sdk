import OpenAI from 'openai';
import type { ChatCompletion } from 'openai/resources/chat/completions';

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

export type MythosChatCompletion = ChatCompletion & Partial<MythosLlmBillingMetadata>;

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

  return {
    mythos_cost_microunits: cost,
    mythos_pricing_source: pricingSource,
    ...(typeof response['mythos_billing_status'] === 'string'
      ? { mythos_billing_status: response['mythos_billing_status'] }
      : {}),
    ...(optionalNonNegativeInteger(response['mythos_provider_cost_credits']) !== undefined
      ? { mythos_provider_cost_credits: optionalNonNegativeInteger(response['mythos_provider_cost_credits']) }
      : {}),
    ...(optionalNonNegativeInteger(response['mythos_creator_margin_credits']) !== undefined
      ? { mythos_creator_margin_credits: optionalNonNegativeInteger(response['mythos_creator_margin_credits']) }
      : {}),
    ...(optionalNonNegativeInteger(response['mythos_platform_fee_credits']) !== undefined
      ? { mythos_platform_fee_credits: optionalNonNegativeInteger(response['mythos_platform_fee_credits']) }
      : {}),
    ...(optionalNonNegativeInteger(response['mythos_charge_credits']) !== undefined
      ? { mythos_charge_credits: optionalNonNegativeInteger(response['mythos_charge_credits']) }
      : {}),
    ...(optionalNonNegativeInteger(response['mythos_creator_earning_credits']) !== undefined
      ? { mythos_creator_earning_credits: optionalNonNegativeInteger(response['mythos_creator_earning_credits']) }
      : {}),
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
  if (!session.llmIdentityToken) {
    throw new MythosError('The Mythos session is missing its LLM identity token', 'LLM_IDENTITY_REQUIRED');
  }

  const baseURL = options.baseURL ?? `${loadConfig().apiUrl.replace(/\/+$/, '')}/v1`;
  return new OpenAI({
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    baseURL,
    defaultHeaders: { 'X-Mythos-Identity': `Bearer ${session.llmIdentityToken}` },
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  });
}
