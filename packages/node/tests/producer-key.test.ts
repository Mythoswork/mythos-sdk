import { once } from 'node:events';
import type { Server } from 'node:http';

import { SignJWT, exportJWK, generateKeyPair, type JWTPayload, type KeyLike } from 'jose';

import type { CreateMythosOptions } from '../src/mythos';

const OWN_KEY = `mk_${'a'.repeat(32)}`;
const OTHER_KEY = `mk_${'b'.repeat(32)}`;
const WARNING = 'MYTHOS_KEY is not set: this app accepts Listings auto-registered by any Mythos Producer. Copy your key from the Mythos dashboard into MYTHOS_KEY. It will be required in 0.6.0.';
const MISMATCH_BODY = {
  success: false,
  error: 'This app is bound to a different Mythos Producer. Check MYTHOS_KEY.',
  code: 'PRODUCER_MISMATCH',
};
const nativeFetch = globalThis.fetch;
const originalEnv = { ...process.env };
let privateKey: KeyLike;
let publicJwk: Awaited<ReturnType<typeof exportJWK>>;
let warn: jest.SpyInstance;
let errorLog: jest.SpyInstance;

beforeAll(async () => {
  const keys = await generateKeyPair('ES256');
  privateKey = keys.privateKey;
  publicJwk = { ...await exportJWK(keys.publicKey), kid: 'producer-test', alg: 'ES256' };
});

beforeEach(async () => {
  jest.resetModules();
  process.env.MYTHOS_KEY = OWN_KEY;
  process.env.MYTHOS_LISTING_ID = 'listing-a';
  delete process.env.MYTHOS_LISTING_IDS;
  process.env.MYTHOS_SESSION_SECRET = 's'.repeat(32);
  process.env.MYTHOS_API_URL = 'https://api.mythos.work';
  delete process.env.MYTHOS_DEBUG;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  globalThis.fetch = jest.fn(async () => new Response(JSON.stringify({ success: true, data: {
    llm_identity_token: 'identity-token',
    llm_identity_expires_at: new Date(Date.now() + 1_800_000).toISOString(),
  } })));
  const jwksCache = await import('../src/jwks-cache');
  const { createLocalJWKSet } = await import('jose');
  const keySet = createLocalJWKSet({ keys: [publicJwk] });
  jest.spyOn(jwksCache, 'getKeySet').mockResolvedValue(keySet);
  jest.spyOn(jwksCache, 'getKeySetWithKidFallback').mockResolvedValue(keySet);
});

afterEach(() => {
  jest.restoreAllMocks();
  globalThis.fetch = nativeFetch;
  process.env = { ...originalEnv };
});

async function mintToken(pkh: unknown, overrides: JWTPayload = {}): Promise<string> {
  return new SignJWT({
    sub: 'user-a', email: 'user@example.test', displayName: 'User', listingId: 'listing-a',
    ...(pkh === undefined ? {} : { pkh }), ...overrides,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'producer-test' })
    .setIssuer('mythos').setAudience(String(overrides.listingId ?? 'listing-a'))
    .setJti(String(overrides.jti ?? 'launch-a')).setExpirationTime('5m').sign(privateKey);
}

async function ownHash(): Promise<string> {
  return (await import('../src/producer-key')).hashProducerKey(OWN_KEY);
}

async function otherHash(): Promise<string> {
  return (await import('../src/producer-key')).hashProducerKey(OTHER_KEY);
}

async function createSdk(options: CreateMythosOptions = {}) {
  return (await import('../src/mythos')).createMythos(options);
}

function request(path: string, token: string, method = 'GET', headers?: HeadersInit): Request {
  return new Request(`https://app.test/${path}?lt=${encodeURIComponent(token)}`, { method, headers });
}

function expectMismatchLog(endpoint: string, listingId = 'listing-a'): void {
  expect(warn.mock.calls).toEqual([['[mythos]', `${endpoint}: producer mismatch`, { listingId }]]);
  expect(errorLog).not.toHaveBeenCalled();
}

test('hash is UTF-8 SHA-256 base64url and matches the fixed contract vector', async () => {
  const { hashProducerKey } = await import('../src/producer-key');
  expect(hashProducerKey('mk_test')).toBe('7i08_9pmD6r4prkeKSsCnOFaCAduf8cz4ogjmhGlpG0');
  expect(hashProducerKey(OWN_KEY)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(hashProducerKey(OWN_KEY)).not.toBe(hashProducerKey(OTHER_KEY));
});

test('mismatch error preserves legacy inheritance and both public exports', async () => {
  const errors = await import('../src/errors');
  const error = new errors.ProducerMismatchError();
  expect(error).toBeInstanceOf(errors.InvalidLaunchTokenError);
  expect(error).toBeInstanceOf(errors.MythosError);
  expect(error).toMatchObject({ name: 'ProducerMismatchError', message: MISMATCH_BODY.error, code: MISMATCH_BODY.code, httpStatus: 401 });
  expect(new errors.InvalidLaunchTokenError()).toMatchObject({ code: 'INVALID_LAUNCH_TOKEN', httpStatus: 401 });
  expect((await import('../src/index')).ProducerMismatchError).toBe(errors.ProducerMismatchError);
  expect((await import('../src/browser')).ProducerMismatchError).toBe(errors.ProducerMismatchError);
});

test('mismatch error takes the Listing ID from sub when listingId is absent (handshake tokens)', async () => {
  const { assertProducerBinding } = await import('../src/producer-key');
  const { ProducerMismatchError } = await import('../src/errors');
  const pkh = await otherHash();
  const caught = (payload: JWTPayload): unknown => {
    try { assertProducerBinding(payload); } catch (error) { return error; }
    return undefined;
  };
  const fromSub = caught({ sub: 'listing-h', pkh });
  expect(fromSub).toBeInstanceOf(ProducerMismatchError);
  expect(fromSub).toMatchObject({ listingId: 'listing-h' });
  expect(caught({ sub: 'user-a', listingId: 'listing-a', pkh })).toMatchObject({ listingId: 'listing-a' });
});

test.each(['foo', 'mk_test', `mk_${'a'.repeat(31)}`, `mk_${'a'.repeat(33)}`, `mk_${'a'.repeat(31)}!`])(
  'startup rejects malformed key %s with exact config error', async (key) => {
    process.env.MYTHOS_KEY = key;
    const { createMythos } = await import('../src/mythos');
    const { MythosConfigError } = await import('../src/errors');
    expect(() => createMythos()).toThrow(new MythosConfigError('MYTHOS_KEY is malformed. Copy it again from the Mythos dashboard.'));
    expect(warn).not.toHaveBeenCalled();
  },
);

test('reading trims keys, treats whitespace as absent and accepts base64url characters', async () => {
  const { readProducerKey, assertProducerKeyFormat } = await import('../src/producer-key');
  process.env.MYTHOS_KEY = `  mk_${'A0_-'.repeat(8)} \n`;
  expect(readProducerKey()).toBe(`mk_${'A0_-'.repeat(8)}`);
  expect(assertProducerKeyFormat).not.toThrow();
  process.env.MYTHOS_KEY = ' \t ';
  expect(readProducerKey()).toBeUndefined();
  expect(assertProducerKeyFormat).not.toThrow();
});

describe.each(['launch', 'handshake', 'listing-callback'] as const)('%s validator binding', (kind) => {
  async function validate(pkh: unknown, overrides: JWTPayload = {}) {
    const purpose = kind === 'handshake' ? 'handshake-check' : kind === 'listing-callback' ? 'listing_registered' : undefined;
    const token = await mintToken(pkh, { ...(purpose ? { purpose } : {}), ...overrides });
    if (kind === 'launch') return (await import('../src/verify')).verifyLaunchToken(token);
    if (kind === 'handshake') return (await import('../src/handshake')).validateHandshakeToken(token);
    return (await import('../src/listing-callback')).validateListingCallbackToken(token);
  }

  test('matching pkh accepts silently', async () => {
    const result = await validate(await ownHash());
    if (kind === 'launch') expect(result).toMatchObject({ listingId: 'listing-a' });
    else expect(result).toBe(kind === 'handshake' ? undefined : 'listing-a');
    expect(warn).not.toHaveBeenCalled();
  });

  test.each(['other', 'missing', 'null', 'number', 'array', 'object'])('rejects %s pkh with typed mismatch', async (state) => {
    const pkh = state === 'other' ? await otherHash() : state === 'missing' ? undefined
      : state === 'null' ? null : state === 'number' ? 123 : state === 'array' ? [await ownHash()] : {};
    const { ProducerMismatchError } = await import('../src/errors');
    await expect(validate(pkh)).rejects.toBeInstanceOf(ProducerMismatchError);
    expect(warn).not.toHaveBeenCalled();
  });

  test.each(['missing', 'other'])('no key accepts %s pkh; static launch is silent, other validators warn once', async (state) => {
    delete process.env.MYTHOS_KEY;
    const pkh = state === 'other' ? await otherHash() : undefined;
    await validate(pkh);
    await validate(pkh);
    expect(warn.mock.calls).toEqual(kind === 'launch' ? [] : [['[mythos]', WARNING]]);
  });
});

test.each(['handshake', 'listing-callback'])('wrong %s purpose is rejected before producer binding and warning', async (kind) => {
  delete process.env.MYTHOS_KEY;
  const token = await mintToken(undefined, { purpose: 'wrong-purpose' });
  const validate = kind === 'handshake' ? (await import('../src/handshake')).validateHandshakeToken
    : (await import('../src/listing-callback')).validateListingCallbackToken;
  await expect(validate(token)).rejects.toMatchObject({ code: 'ERR_JWT_CLAIM_VALIDATION_FAILED' });
  expect(warn).not.toHaveBeenCalled();
});

test('direct dynamic verification warns once, even across handshake and callback validators', async () => {
  delete process.env.MYTHOS_KEY;
  delete process.env.MYTHOS_LISTING_ID;
  const { verifyLaunchToken } = await import('../src/verify');
  const token = await mintToken(undefined);
  await verifyLaunchToken(token, { resolveListingIds: async () => ['listing-a'] });
  await verifyLaunchToken(token, { resolveListingIds: async () => ['listing-a'] });
  await (await import('../src/handshake')).validateHandshakeToken(await mintToken(undefined, { purpose: 'handshake-check' }));
  await (await import('../src/listing-callback')).validateListingCallbackToken(await mintToken(undefined, { purpose: 'listing_registered' }));
  expect(warn.mock.calls).toEqual([['[mythos]', WARNING]]);
});

test('static launch verification stays silent when a resolver also returns the same listing', async () => {
  delete process.env.MYTHOS_KEY;
  const { verifyLaunchToken } = await import('../src/verify');
  await verifyLaunchToken(await mintToken(undefined), { resolveListingIds: async () => ['listing-a', 'listing-b'] });
  expect(warn).not.toHaveBeenCalled();
  await verifyLaunchToken(await mintToken(undefined, { listingId: 'listing-b' }), { resolveListingIds: async () => ['listing-b'] });
  expect(warn.mock.calls).toEqual([['[mythos]', WARNING]]);
});

test.each(['resolver', 'callback'])('missing key startup %s warning counts once across SDK instances and all endpoints', async (option) => {
  process.env.MYTHOS_KEY = '  ';
  const options = option === 'resolver' ? { resolveListingIds: async () => ['listing-b'] }
    : { onListingRegistered: jest.fn(async (_id: string) => undefined) };
  const sdk = await createSdk(options);
  await createSdk(options);
  expect(warn.mock.calls).toEqual([['[mythos]', WARNING]]);
  for (const path of ['api/mythos/session', 'api/mythos/handshake', 'api/mythos/listing-registered']) {
    const purpose = path.endsWith('handshake') ? 'handshake-check' : path.endsWith('registered') ? 'listing_registered' : undefined;
    await sdk.handle(request(path, await mintToken(undefined, { ...(purpose ? { purpose } : {}) })));
  }
  expect(warn.mock.calls).toEqual([['[mythos]', WARNING]]);
});

test.each(['singular', 'plural'])('legacy static %s listing session is accepted silently', async (kind) => {
  delete process.env.MYTHOS_KEY;
  if (kind === 'plural') {
    delete process.env.MYTHOS_LISTING_ID;
    process.env.MYTHOS_LISTING_IDS = 'listing-other, listing-a';
  }
  const response = await (await createSdk()).handle(request('api/mythos/session', await mintToken(await otherHash())));
  expect(response.status).toBe(200);
  expect(warn).not.toHaveBeenCalled();
});

test('dynamic no-key sessions succeed twice with only the startup warning', async () => {
  delete process.env.MYTHOS_KEY;
  delete process.env.MYTHOS_LISTING_ID;
  const sdk = await createSdk({ resolveListingIds: async () => ['listing-a'] });
  for (const jti of ['launch-1', 'launch-2']) {
    expect((await sdk.handle(request('api/mythos/session', await mintToken(undefined, { jti })))).status).toBe(200);
  }
  expect(warn.mock.calls).toEqual([['[mythos]', WARNING]]);
  expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});

test.each(['GET', 'POST'])('matching session %s consumes and issues a bound session', async (method) => {
  const sdk = await createSdk();
  const response = await sdk.handle(request('api/mythos/session', await mintToken(await ownHash()), method));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, data: { session: { listingId: 'listing-a' } } });
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  expect(String(jest.mocked(globalThis.fetch).mock.calls[0][0])).toMatch(/\/consume$/);
  expect(warn).not.toHaveBeenCalled();
});

test.each(['other', 'missing'])('session %s pkh returns exact 401 with no consume or session headers', async (kind) => {
  const response = await (await createSdk()).handle(request('api/mythos/session', await mintToken(kind === 'other' ? await otherHash() : undefined)));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual(MISMATCH_BODY);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(response.headers.has('set-cookie')).toBe(false);
  expect(response.headers.has('x-mythos-session')).toBe(false);
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expectMismatchLog('session');
});

test.each(['handshake', 'listing-registered'])('web %s matching producer succeeds', async (endpoint) => {
  const onListingRegistered = jest.fn(async (_id: string) => undefined);
  const sdk = await createSdk({ onListingRegistered });
  const purpose = endpoint === 'handshake' ? 'handshake-check' : 'listing_registered';
  const response = await sdk.handle(request(`.well-known/mythos-${endpoint}`, await mintToken(await ownHash(), { purpose })));
  expect(response.status).toBe(200);
  if (endpoint === 'handshake') {
    expect(await response.json()).toEqual({ ok: true, sdk_version: '0.5.0' });
    expect(onListingRegistered).not.toHaveBeenCalled();
  } else {
    expect(await response.json()).toEqual({ ok: true });
    expect(onListingRegistered).toHaveBeenCalledWith('listing-a');
  }
  expect(warn).not.toHaveBeenCalled();
});

test.each(['handshake', 'listing-registered'])('web %s no-key legacy request succeeds with one warning', async (endpoint) => {
  delete process.env.MYTHOS_KEY;
  const onListingRegistered = jest.fn(async (_id: string) => undefined);
  const sdk = await createSdk(endpoint === 'listing-registered' ? { onListingRegistered } : {});
  const purpose = endpoint === 'handshake' ? 'handshake-check' : 'listing_registered';
  const token = await mintToken(await otherHash(), { purpose });
  for (let index = 0; index < 2; index++) {
    const response = await sdk.handle(request(`.well-known/mythos-${endpoint}`, token));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  }
  expect(warn.mock.calls).toEqual([['[mythos]', WARNING]]);
  if (endpoint === 'listing-registered') expect(onListingRegistered).toHaveBeenCalledTimes(2);
});

test.each([
  ['handshake', 'GET', 'handshake-check', 'handshake'],
  ['listing-registered', 'GET', 'listing_registered', 'listing-callback'],
  ['listing-registered', 'POST', 'listing_registered', 'listing-callback'],
])('web %s %s rejects foreign/missing producer without callbacks', async (endpoint, method, purpose, logLabel) => {
  const onListingRegistered = jest.fn(async (_id: string) => undefined);
  const sdk = await createSdk({ onListingRegistered });
  for (const pkh of [await otherHash(), undefined]) {
    warn.mockClear();
    const response = await sdk.handle(request(`.well-known/mythos-${endpoint}`, await mintToken(pkh, { purpose }), method));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Producer mismatch' });
    expect(response.headers.has('set-cookie')).toBe(false);
    expectMismatchLog(logLabel);
  }
  expect(onListingRegistered).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test('hijack: rejected new callback cannot store a listing; pre-seeded foreign launch cannot consume', async () => {
  const listings = new Set<string>();
  const onListingRegistered = jest.fn(async (id: string) => { listings.add(id); });
  const sdk = await createSdk({ resolveListingIds: async () => [...listings], onListingRegistered });
  const pkh = await otherHash();
  const callback = await sdk.handle(request('api/mythos/listing-registered', await mintToken(pkh, { purpose: 'listing_registered', listingId: 'listing-b' }), 'POST'));
  expect(callback.status).toBe(401);
  expect(await callback.json()).toEqual({ error: 'Producer mismatch' });
  expect(onListingRegistered).not.toHaveBeenCalled();
  expect([...listings]).toEqual([]);
  listings.add('listing-b');
  const launch = await sdk.handle(request('api/mythos/session', await mintToken(pkh, { listingId: 'listing-b' })));
  expect(launch.status).toBe(401);
  expect(await launch.json()).toEqual(MISMATCH_BODY);
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(warn.mock.calls).toEqual([
    ['[mythos]', 'listing-callback: producer mismatch', { listingId: 'listing-b' }],
    ['[mythos]', 'session: producer mismatch', { listingId: 'listing-b' }],
  ]);
});

test.each(['cookie', 'header'])('mismatch with different jti cannot replace an existing %s session; same-jti fallback is retained', async (transport) => {
  const sdk = await createSdk();
  const first = await sdk.handle(request('api/mythos/session', await mintToken(await ownHash())));
  const body = await first.json() as { data: { sessionToken: string } };
  const headers: Record<string, string> = transport === 'cookie' ? { cookie: `mythos_session=${body.data.sessionToken}` }
    : { 'x-mythos-session': body.data.sessionToken };
  jest.mocked(globalThis.fetch).mockClear();
  const rejected = await sdk.handle(request('api/mythos/session', await mintToken(await otherHash(), { jti: 'new-foreign-jti' }), 'GET', headers));
  expect(rejected.status).toBe(401);
  expect(await rejected.json()).toEqual(MISMATCH_BODY);
  expect(rejected.headers.has('set-cookie')).toBe(false);
  expect((await sdk.getSession(new Request('https://app.test', { headers })))?.sessionJti).toBe('launch-a');
  const fallback = await sdk.handle(request('api/mythos/session', await mintToken(await otherHash()), 'GET', headers));
  expect(fallback.status).toBe(200);
  expect(await fallback.json()).toMatchObject({ data: { session: { sessionJti: 'launch-a' } } });
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

async function withExpressServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const express = (await import('express')).default;
  const app = express();
  const { handshakeRoute } = await import('../src/handshake');
  const { listingCallbackRoute } = await import('../src/listing-callback');
  const { requireLaunchToken } = await import('../src/middleware');
  const onRegistered = jest.fn(async (_id: string) => undefined);
  app.use(handshakeRoute());
  app.all('/callback', listingCallbackRoute(onRegistered));
  app.get('/legacy', requireLaunchToken(), (_req, res) => res.json({ ok: true }));
  const server: Server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected listening port');
    await run(`http://127.0.0.1:${address.port}`);
    expect(onRegistered).not.toHaveBeenCalled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test.each([
  ['handshake', 'GET', 'handshake-check', 'handshake'],
  ['callback', 'GET', 'listing_registered', 'listing-callback'],
  ['callback', 'POST', 'listing_registered', 'listing-callback'],
  ['legacy', 'GET', undefined, undefined],
])('Express %s %s maps real signed mismatches to exact 401', async (path, method, purpose, logLabel) => {
  const token = await mintToken(await otherHash(), { ...(purpose ? { purpose } : {}) });
  await withExpressServer(async (baseUrl) => {
    const route = path === 'handshake' ? '.well-known/mythos-handshake' : path;
    const response = await nativeFetch(`${baseUrl}/${route}?lt=${token}`, { method });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: path === 'legacy' ? 'Invalid launch token' : 'Producer mismatch' });
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    if (logLabel) expectMismatchLog(logLabel);
  });
});
