import { decodeSession, encodeSession } from '../src/session';
import { MythosConfigError } from '../src/errors';
import type { MythosSession } from '../src/types';

const SESSION: MythosSession = {
  userId: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  listingId: 'listing-abc',
  sessionJti: 'jti-001',
  llmIdentityToken: 'identity-token',
  llmIdentityExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
};

beforeEach(() => {
  process.env.MYTHOS_SESSION_SECRET = 'test-secret-do-not-use-in-prod';
});

afterEach(() => {
  delete process.env.MYTHOS_SESSION_SECRET;
});

test('round-trips a session through encode and decode', () => {
  const token = encodeSession(SESSION);
  expect(decodeSession(token)).toEqual(SESSION);
});

test('returns null for a tampered token', () => {
  const token = encodeSession(SESSION);
  const tampered = token.slice(0, -4) + (token.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  expect(decodeSession(tampered)).toBeNull();
});

test('returns null when decoded with the wrong secret', () => {
  const token = encodeSession(SESSION);
  process.env.MYTHOS_SESSION_SECRET = 'a-completely-different-secret';
  expect(decodeSession(token)).toBeNull();
});

test('returns null for malformed input', () => {
  expect(decodeSession('not-a-valid-token')).toBeNull();
});

test('returns null once llmIdentityExpiresAt has passed', () => {
  const expired: MythosSession = { ...SESSION, llmIdentityExpiresAt: new Date(Date.now() - 1000).toISOString() };
  const token = encodeSession(expired);
  expect(decodeSession(token)).toBeNull();
});

test('round-trips a session with no llmIdentityExpiresAt at all', () => {
  const { llmIdentityExpiresAt, ...withoutExpiry } = SESSION;
  void llmIdentityExpiresAt;
  const token = encodeSession(withoutExpiry);
  expect(decodeSession(token)).toEqual(withoutExpiry);
});

test('throws MythosConfigError when MYTHOS_SESSION_SECRET is missing', () => {
  delete process.env.MYTHOS_SESSION_SECRET;
  expect(() => encodeSession(SESSION)).toThrow(MythosConfigError);
});
