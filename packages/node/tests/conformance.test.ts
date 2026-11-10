import { readFileSync } from 'fs';
import { join } from 'path';

import { openSession, sealSessionWithIv, type StoredSession } from '../src/session';
import { hashProducerKey } from '../src/producer-key';
import { assertUsd, normalizeUsd } from '../src/usd';

// Shared fixed vectors prove Node and Python produce the same encrypted cookie bytes.
interface SessionVectors {
  secret: string;
  valid: Array<{ name: string; iv_hex: string; payload: StoredSession; token: string }>;
  invalid: Array<{ name: string; token: string }>;
}

const vectors = JSON.parse(readFileSync(
  join(__dirname, '../../../conformance/session-v1.json'), 'utf8',
)) as SessionVectors;

const producerVectors = JSON.parse(readFileSync(
  join(__dirname, '../../../conformance/producer-key-v1.json'), 'utf8',
)) as { vectors: Array<{ key: string; pkh: string }> };

const usdVectors = JSON.parse(readFileSync(
  join(__dirname, '../../../conformance/usd-format-v1.json'), 'utf8',
)) as { valid: string[]; invalid: string[]; numeric: { valid: [number, string][]; invalid: number[] } };

test.each(usdVectors.numeric.valid)('numeric USD %s normalizes to %s', (usd, expected) => {
  expect(normalizeUsd(usd)).toBe(expected);
});

test.each(usdVectors.numeric.invalid)('invalid numeric USD %s is rejected', (usd) => {
  expect(() => normalizeUsd(usd)).toThrow(expect.objectContaining({ code: 'INVALID_CHARGE_AMOUNT', httpStatus: 400 }));
});

test.each(usdVectors.valid)('USD %s has valid format', (usd) => {
  expect(() => assertUsd(usd)).not.toThrow();
});

test.each([...usdVectors.invalid, '1\n'])('invalid USD %s is rejected', (usd) => {
  expect(() => assertUsd(usd)).toThrow(expect.objectContaining({ code: 'INVALID_CHARGE_AMOUNT', httpStatus: 400 }));
});

test('USD format validation imposes no client-side credit limit', () => {
  expect(() => assertUsd('900719925474.0992')).not.toThrow();
});

test.each(producerVectors.vectors)('producer key shared hash vector', ({ key, pkh }) => {
  expect(hashProducerKey(key)).toBe(pkh);
});

beforeEach(() => {
  process.env.MYTHOS_SESSION_SECRET = vectors.secret;
});

test.each(vectors.valid)('v1 vector $name seals and opens exactly', ({ payload, iv_hex, token }) => {
  expect(sealSessionWithIv(payload, Buffer.from(iv_hex, 'hex'))).toBe(token);
  expect(openSession(token)).toEqual(payload);
});

test.each(vectors.invalid)('v1 vector $name is rejected', ({ token }) => {
  expect(openSession(token)).toBeNull();
});
