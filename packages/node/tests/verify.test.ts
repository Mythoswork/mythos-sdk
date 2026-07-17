import { SignJWT, generateKeyPair, exportJWK, type KeyLike } from 'jose';
import * as jwksCache from '../src/jwks-cache';

let privateKey: KeyLike;
let publicKey: KeyLike;

beforeAll(async () => {
  const kp = await generateKeyPair('RS256', { modulusLength: 2048 });
  privateKey = kp.privateKey;
  publicKey = kp.publicKey;

  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-kid';
  jwk.alg = 'RS256';

  const { createLocalJWKSet } = await import('jose');
  const keySet = createLocalJWKSet({ keys: [jwk] });
  jest.spyOn(jwksCache, 'getKeySet').mockResolvedValue(keySet as never);
  jest.spyOn(jwksCache, 'getKeySetWithKidFallback').mockResolvedValue(keySet as never);
});

beforeEach(() => {
  process.env.MYTHOS_LISTING_ID = 'listing-abc';
  process.env.MYTHOS_API_URL = 'https://api.mythos.work';
  delete process.env.MYTHOS_LISTING_IDS;
});

async function mintToken(overrides: Record<string, unknown> = {}): Promise<string> {
  const base = {
    sub: 'user-123',
    email: 'consumer@example.com',
    displayName: 'Test User',
    listingId: 'listing-abc',
  };
  return new SignJWT({ ...base, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setAudience('listing-abc')
    .setJti('jti-001')
    .setExpirationTime('5m')
    .sign(privateKey);
}

test('valid token accepted and claims mapped correctly', async () => {
  const { verifyLaunchToken } = await import('../src/verify');
  const token = await mintToken();
  const session = await verifyLaunchToken(token);

  expect(session.userId).toBe('user-123');
  expect(session.email).toBe('consumer@example.com');
  expect(session.displayName).toBe('Test User');
  expect(session.listingId).toBe('listing-abc');
  expect(session.sessionJti).toBe('jti-001');
});

test('aud array with valid member in second position accepted', async () => {
  const { verifyLaunchToken } = await import('../src/verify');
  const token = await new SignJWT({
    sub: 'user-123',
    email: 'consumer@example.com',
    displayName: 'Test User',
    listingId: 'listing-abc',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setAudience(['other-service', 'listing-abc'])
    .setJti('jti-001')
    .setExpirationTime('5m')
    .sign(privateKey);

  const session = await verifyLaunchToken(token);
  expect(session.listingId).toBe('listing-abc');
});

test('missing jti claim rejected', async () => {
  const { verifyLaunchToken } = await import('../src/verify');
  const token = await new SignJWT({
    sub: 'user-123',
    email: 'consumer@example.com',
    displayName: 'Test User',
    listingId: 'listing-abc',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setAudience('listing-abc')
    .setExpirationTime('5m')
    .sign(privateKey);

  await expect(verifyLaunchToken(token)).rejects.toMatchObject({ code: 'INVALID_LAUNCH_TOKEN' });
});

test('expired token rejected', async () => {
  const { verifyLaunchToken } = await import('../src/verify');
  const token = await new SignJWT({ sub: 'u', email: 'e', displayName: 'd', listingId: 'listing-abc' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setAudience('listing-abc')
    .setJti('jti-expired')
    .setExpirationTime('-1s')
    .sign(privateKey);

  await expect(verifyLaunchToken(token)).rejects.toThrow();
});

test('wrong aud rejected', async () => {
  const { verifyLaunchToken } = await import('../src/verify');
  const token = await new SignJWT({ sub: 'u', email: 'e', displayName: 'd', listingId: 'wrong-listing' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setAudience('wrong-listing')
    .setJti('jti-wrong')
    .setExpirationTime('5m')
    .sign(privateKey);

  await expect(verifyLaunchToken(token)).rejects.toMatchObject({ code: 'INVALID_LAUNCH_TOKEN' });
});

test('resolveListingIds allows aud not in static list', async () => {
  const { verifyLaunchToken } = await import('../src/verify');
  const token = await new SignJWT({ sub: 'u', email: 'e', displayName: 'd', listingId: 'listing-dynamic' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setAudience('listing-dynamic')
    .setJti('jti-dyn')
    .setExpirationTime('5m')
    .sign(privateKey);

  const session = await verifyLaunchToken(token, {
    resolveListingIds: async () => ['listing-dynamic'],
  });
  expect(session.listingId).toBe('listing-dynamic');
});

test('resolveListingIds miss + static miss → rejected', async () => {
  const { verifyLaunchToken } = await import('../src/verify');
  const token = await new SignJWT({ sub: 'u', email: 'e', displayName: 'd', listingId: 'other' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setAudience('other')
    .setJti('jti-miss')
    .setExpirationTime('5m')
    .sign(privateKey);

  await expect(
    verifyLaunchToken(token, { resolveListingIds: async () => ['listing-xyz'] }),
  ).rejects.toThrow('Token audience does not match configured listing ID');
});

test('resolveListingIds allows aud when no static listing IDs configured at all', async () => {
  // Regression: producer relying purely on dynamic resolution (e.g. via the
  // listing-registered callback), with no MYTHOS_LISTING_ID(S) env var set.
  delete process.env.MYTHOS_LISTING_ID;
  delete process.env.MYTHOS_LISTING_IDS;

  const { verifyLaunchToken } = await import('../src/verify');
  const token = await new SignJWT({ sub: 'u', email: 'e', displayName: 'd', listingId: 'listing-dynamic' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setAudience('listing-dynamic')
    .setJti('jti-dyn-only')
    .setExpirationTime('5m')
    .sign(privateKey);

  const session = await verifyLaunchToken(token, {
    resolveListingIds: async () => ['listing-dynamic'],
  });
  expect(session.listingId).toBe('listing-dynamic');
});

test('no static and no dynamic listing IDs → clear config error', async () => {
  delete process.env.MYTHOS_LISTING_ID;
  delete process.env.MYTHOS_LISTING_IDS;

  const { verifyLaunchToken } = await import('../src/verify');
  const token = await mintToken();

  await expect(verifyLaunchToken(token)).rejects.toThrow(
    'MYTHOS_LISTING_ID or MYTHOS_LISTING_IDS env var is required',
  );
});

test('aud list with valid member at index 1 accepted', async () => {
  const { verifyLaunchToken } = await import('../src/verify');
  const token = await new SignJWT({
    sub: 'user-123',
    email: 'consumer@example.com',
    displayName: 'Test User',
    listingId: 'listing-abc',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setAudience(['evil-other-service', 'listing-abc'])
    .setJti('jti-001')
    .setExpirationTime('5m')
    .sign(privateKey);

  const session = await verifyLaunchToken(token);
  expect(session.listingId).toBe('listing-abc');
});

test('aud list with no matching member rejected', async () => {
  const { verifyLaunchToken } = await import('../src/verify');
  const token = await new SignJWT({
    sub: 'u',
    email: 'e',
    displayName: 'd',
    listingId: 'listing-abc',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setAudience(['evil-a', 'evil-b'])
    .setJti('jti-bad-aud')
    .setExpirationTime('5m')
    .sign(privateKey);

  await expect(verifyLaunchToken(token)).rejects.toThrow();
});

test('alg:none rejected — hard block', async () => {
  const { verifyLaunchToken } = await import('../src/verify');
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ sub: 'u', aud: 'listing-abc', exp: Math.floor(Date.now() / 1000) + 300, jti: 'jti-none' }),
  ).toString('base64url');
  const noneToken = `${header}.${body}.`;

  await expect(verifyLaunchToken(noneToken)).rejects.toThrow();
});
