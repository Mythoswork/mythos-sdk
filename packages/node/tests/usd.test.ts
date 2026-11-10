import { usdToCreditsAtRate } from '../src/usd';

test.each([
  ['0.15', 10000, 1500], ['0.0001', 10000, 1], ['1', 3, 3],
  ['0001.50', 2, 3], ['9007199254740991', 1, Number.MAX_SAFE_INTEGER],
])('converts %s USD at rate %s exactly', (usd, rate, credits) => {
  expect(usdToCreditsAtRate(usd, rate)).toBe(credits);
});

test.each([['0.0001', 3], ['9007199254740992', 1], ['invalid', 10000]])(
  'rejects fractional, overflowing or invalid conversion %s at %s', (usd, rate) => {
    expect(() => usdToCreditsAtRate(usd as string, rate as number)).toThrow(
      expect.objectContaining({ code: 'INVALID_CHARGE_AMOUNT' }),
    );
  },
);
