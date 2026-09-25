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
