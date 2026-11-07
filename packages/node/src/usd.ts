import { CREDITS_PER_USD } from './constants/billing.constants';
import { MythosError } from './errors';

export function usdToCredits(usd: string): number {
  const invalid = 'usd must be a decimal string with at most 4 decimal places, e.g. "0.15"';
  if (typeof usd !== 'string' || !/^\d+(\.\d{1,4})?(?![\s\S])/.test(usd)) {
    throw new MythosError(invalid, 'INVALID_CHARGE_AMOUNT', 400);
  }
  const [whole, fraction = ''] = usd.split('.');
  const digits = `${whole}${fraction.padEnd(String(CREDITS_PER_USD).length - 1, '0')}`.replace(/^0+/, '') || '0';
  if (digits === '0') throw new MythosError('usd must be greater than 0', 'INVALID_CHARGE_AMOUNT', 400);
  const max = String(Number.MAX_SAFE_INTEGER);
  if (digits.length > max.length || (digits.length === max.length && digits > max)) {
    throw new MythosError(invalid, 'INVALID_CHARGE_AMOUNT', 400);
  }
  return Number(digits);
}
