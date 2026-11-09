import { MythosError } from './errors';

export function assertUsd(usd: string): void {
  const invalid = 'usd must be a decimal string with at most 4 decimal places, e.g. "0.15"';
  if (typeof usd !== 'string' || !/^\d+(\.\d{1,4})?(?![\s\S])/.test(usd)) {
    throw new MythosError(invalid, 'INVALID_CHARGE_AMOUNT', 400);
  }
  if (!/[1-9]/.test(usd)) throw new MythosError('usd must be greater than 0', 'INVALID_CHARGE_AMOUNT', 400);
}
