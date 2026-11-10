import { normalizeUsd, usdToCreditsAtRate } from '../src/usd';

test.each([[0.15, '0.15'], ['0.15', '0.15'], [1, '1']])('normalizes USD %p without rounding', (value, expected) => {
  expect(normalizeUsd(value)).toBe(expected);
});

test.each([0.1 + 0.2, NaN, Infinity, -Infinity, -1, 0, true, null, {}, 1e-7, 2 ** 53])(
  'rejects numeric or unsupported USD %p', (value) => {
    expect(() => normalizeUsd(value)).toThrow(expect.objectContaining({ code: 'INVALID_CHARGE_AMOUNT', httpStatus: 400 }));
  },
);

test('normalization preserves exact strings and supplies a rounding hint for computed floats', () => {
  expect(normalizeUsd('0000.1500')).toBe('0000.1500');
  expect(() => normalizeUsd(0.1 + 0.2)).toThrow('round it first');
  expect(usdToCreditsAtRate(normalizeUsd(0.15), 10000)).toBe(1500);
});

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
