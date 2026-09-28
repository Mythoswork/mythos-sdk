import { encodeSession, openSession, sealSession, sealSessionWithIv, type StoredSession } from '../src/session';

const session: StoredSession = {
  userId: 'u', email: 'u@example.com', displayName: 'U', listingId: 'l', sessionJti: 'j',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

beforeEach(() => { process.env.MYTHOS_SESSION_SECRET = 'session-v1-test-secret-0123456789'; });

test('v1 round-trip, fixed IV and tamper rejection', () => {
  const token = sealSession(session);
  expect(token.startsWith('v1.')).toBe(true);
  expect(openSession(token)).toEqual(session);
  const fixed = sealSessionWithIv(session, Buffer.alloc(12));
  const bytes = Buffer.from(fixed.slice(3), 'base64url');
  bytes[15] ^= 1;
  expect(openSession(`v1.${bytes.toString('base64url')}`)).toBeNull();
});

test('legacy unprefixed, expired and malformed sealed sessions are rejected', () => {
  expect(openSession(encodeSession(session))).toBeNull();
  expect(openSession(sealSession({ ...session, expiresAt: '2000-01-01T00:00:00.000Z' }))).toBeNull();
  expect(openSession('v1.abc')).toBeNull();
});

test('Python-style null optionals are removed on open', () => {
  const withNulls = { ...session, llmIdentityToken: null, llmIdentityExpiresAt: null } as unknown as StoredSession;
  expect(openSession(sealSession(withNulls))).toEqual(session);
});
