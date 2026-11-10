import { MythosError } from './errors';

export function normalizeUsd(usd: unknown): string {
  if (typeof usd === 'number') {
    if (!Number.isFinite(usd) || usd <= 0 || usd > Number.MAX_SAFE_INTEGER) {
      throw new MythosError('usd must be a positive finite number within the safe integer limit', 'INVALID_CHARGE_AMOUNT', 400);
    }
    const value = String(usd);
    try {
      assertUsd(value);
    } catch {
      throw new MythosError(`usd ${value} is not a plain decimal with at most 4 decimal places; round it first (e.g. Number(x.toFixed(2))) or pass a string`, 'INVALID_CHARGE_AMOUNT', 400);
    }
    return value;
  }
  assertUsd(usd as string);
  return usd as string;
}

export function assertUsd(usd: string): void {
  const invalid = 'usd must be a decimal string with at most 4 decimal places, e.g. "0.15"';
  if (typeof usd !== 'string' || !/^\d+(\.\d{1,4})?(?![\s\S])/.test(usd)) {
    throw new MythosError(invalid, 'INVALID_CHARGE_AMOUNT', 400);
  }
  if (!/[1-9]/.test(usd)) throw new MythosError('usd must be greater than 0', 'INVALID_CHARGE_AMOUNT', 400);
}

export function usdToCreditsAtRate(usd: string, rate: number): number {
  assertUsd(usd);
  const [whole, fraction = ''] = usd.split('.');
  const units = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
  const n = units * BigInt(rate);
  if (n % 10000n !== 0n) {
    throw new MythosError('USD amount is not a whole number of credits', 'INVALID_CHARGE_AMOUNT', 400);
  }
  const credits = n / 10000n;
  if (credits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MythosError('USD amount exceeds the safe credit limit', 'INVALID_CHARGE_AMOUNT', 400);
  }
  return Number(credits);
}
