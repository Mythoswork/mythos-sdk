import { SignJWT, exportJWK, generateKeyPair, type KeyLike } from 'jose';

let privateKey: KeyLike;
let publicJwk: Awaited<ReturnType<typeof exportJWK>>;

beforeAll(async () => {
  const keys = await generateKeyPair('ES256');
  privateKey = keys.privateKey;
  publicJwk = await exportJWK(keys.publicKey);
  publicJwk.kid = 'k1';
  publicJwk.alg = 'ES256';
});

beforeEach(() => {
  jest.resetModules();
  process.env.MYTHOS_LISTING_ID = 'listing-abc';
  process.env.MYTHOS_API_URL = 'https://api.mythos.work';
  process.env.MYTHOS_SESSION_SECRET = 'x'.repeat(32);
  delete process.env.MYTHOS_LISTING_IDS;
  (globalThis as { fetch: typeof fetch }).fetch = jest.fn(async (input) => {
    const url = String(input);
    if (url.endsWith('/consume')) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          llm_identity_token: 'identity-token',
          llm_identity_expires_at: new Date(Date.now() + 1_800_000).toISOString(),
        },
      }), { status: 200 });
    }
    if (url.endsWith('/meter')) {
      return new Response(JSON.stringify({ success: true, data: { session_metered_total: 3 } }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
});

async function createTestToken(jti: string, expiresAt: string | number = '5m', purpose?: string): Promise<string> {
  return new SignJWT({ email: 'a@b.c', displayName: 'A', listingId: 'listing-abc', ...(purpose ? { purpose } : {}) })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setIssuer('mythos')
    .setSubject('user-1')
    .setAudience('listing-abc')
    .setJti(jti)
    .setExpirationTime(expiresAt)
    .sign(privateKey);
}

async function createSdk(options: {
  resolveListingIds?: () => Promise<string[]>;
  onListingRegistered?: (listingId: string) => Promise<void>;
} = {}) {
  const jwksCache = await import('../src/jwks-cache');
  const { createLocalJWKSet } = await import('jose');
  const keySet = createLocalJWKSet({ keys: [publicJwk] });
  jest.spyOn(jwksCache, 'getKeySet').mockResolvedValue(keySet as never);
  jest.spyOn(jwksCache, 'getKeySetWithKidFallback').mockResolvedValue(keySet as never);
  const { createMythos } = await import('../src/mythos');
  return createMythos(options);
}

function sessionRequest(url: string, cookie?: string, sessionHeader?: string): Request {
  return new Request(url, {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(sessionHeader ? { 'x-mythos-session': sessionHeader } : {}),
    },
  });
}

function cookiePair(response: Response): string {
  const cookie = response.headers.getSetCookie()[0];
  if (!cookie) throw new Error('Expected a Set-Cookie header');
  return cookie.split(';')[0] ?? '';
}

test('createMythos validates required secret length and listing IDs', async () => {
  const { createMythos } = await import('../src/mythos');
  const { MythosConfigError } = await import('../src/errors');

  delete process.env.MYTHOS_SESSION_SECRET;
  expect(() => createMythos()).toThrow(expect.objectContaining({ name: 'MythosConfigError', message: expect.stringContaining('MYTHOS_SESSION_SECRET') }));
  process.env.MYTHOS_SESSION_SECRET = 'short';
  expect(() => createMythos()).toThrow(expect.objectContaining({ name: 'MythosConfigError', message: expect.stringContaining('at least 32') }));
  process.env.MYTHOS_SESSION_SECRET = 'x'.repeat(32);
  delete process.env.MYTHOS_LISTING_ID;
  expect(() => createMythos()).toThrow(new MythosConfigError('MYTHOS_LISTING_ID (or MYTHOS_LISTING_IDS) is not set'));
  expect(() => createMythos({ resolveListingIds: async () => ['listing-abc'] })).not.toThrow();
});

test('createMythos rejects a non-http API URL', async () => {
  process.env.MYTHOS_API_URL = 'ftp://api.mythos.work';
  await expect(createSdk()).rejects.toThrow('MYTHOS_API_URL is not a valid http(s) URL');
});

test('first launch consumes the token, returns public session and secure partitioned cookie', async () => {
  const sdk = await createSdk();
  const launchToken = await createTestToken('j1');
  const response = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${launchToken}`));
  const body = await response.json() as { success: boolean; data: { session: Record<string, unknown>; sessionToken: string } };

  expect(response.status).toBe(200);
  expect(body.data.session.sessionJti).toBe('j1');
  expect(body.data.session).not.toHaveProperty('llmIdentityToken');
  expect(body.data.sessionToken).toBe(cookiePair(response).split('=')[1]);
  expect(response.headers.getSetCookie()[0]).toContain('HttpOnly');
  expect(response.headers.getSetCookie()[0]).toContain('SameSite=None');
  expect(response.headers.getSetCookie()[0]).toContain('Secure');
  expect(response.headers.getSetCookie()[0]).toContain('Partitioned');
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(String(jest.mocked(global.fetch).mock.calls[0]?.[0]).endsWith('/consume')).toBe(true);
});

test('same launch token and cookie reuses the session without consuming twice', async () => {
  const sdk = await createSdk();
  const launchToken = await createTestToken('j1');
  const first = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${launchToken}`));
  const second = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${launchToken}`, cookiePair(first)));
  expect(second.status).toBe(200);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('page switch without lt reuses cookie and standalone request returns null', async () => {
  const sdk = await createSdk();
  const first = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${await createTestToken('j1')}`));
  const switched = await sdk.handle(sessionRequest('https://app.test/api/mythos/session', cookiePair(first)));
  const standalone = await sdk.handle(sessionRequest('https://app.test/api/mythos/session'));
  const switchedBody = await switched.json() as { data: { session: { sessionJti: string } } };
  const standaloneBody = await standalone.json() as { data: null };
  expect(switchedBody.data.session.sessionJti).toBe('j1');
  expect(standaloneBody.data).toBeNull();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('web-standard POST handler dispatches the session route too', async () => {
  const sdk = await createSdk();
  const response = await sdk.handlers.POST(new Request('https://app.test/api/mythos/session', { method: 'POST' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, data: null });
});

test('new launch token replaces a stale cookie session', async () => {
  const sdk = await createSdk();
  const first = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${await createTestToken('j1')}`));
  const second = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${await createTestToken('j2')}`, cookiePair(first)));
  const body = await second.json() as { data: { session: { sessionJti: string } } };
  expect(body.data.session.sessionJti).toBe('j2');
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('expired sealed session is treated as absent', async () => {
  const sdk = await createSdk();
  const { sealSession } = await import('../src/session');
  const expired = sealSession({
    userId: 'user-1', email: 'a@b.c', displayName: 'A', listingId: 'listing-abc', sessionJti: 'j1',
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  expect(await sdk.getSession(sessionRequest('https://app.test', undefined, expired))).toBeNull();
  await expect(sdk.charge(sessionRequest('https://app.test', undefined, expired), { credits: 1 }))
    .rejects.toMatchObject({ name: 'SessionRequiredError' });
});

test('header-only session transport supports getSession and charge', async () => {
  const sdk = await createSdk();
  const launch = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${await createTestToken('j1')}`));
  const body = await launch.json() as { data: { sessionToken: string } };
  expect((await sdk.getSession(sessionRequest('https://app.test', undefined, body.data.sessionToken)))?.sessionJti).toBe('j1');
  await expect(sdk.charge(sessionRequest('https://app.test', undefined, body.data.sessionToken), {
    credits: 1,
    idempotencyKey: 'k-1',
  })).resolves.toEqual({ chargeId: 'k-1', sessionMeteredTotal: 3 });
  const call = jest.mocked(global.fetch).mock.calls.find(([input]) => String(input).endsWith('/meter'));
  expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ charge_id: 'k-1', credits: 1 });
});

test('consume 409 returns a typed token-consumed error response', async () => {
  jest.mocked(global.fetch).mockImplementation(async () => new Response('{}', { status: 409 }));
  const sdk = await createSdk();
  const response = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${await createTestToken('j3')}`));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'TOKEN_ALREADY_CONSUMED' });
});

test('consume upstream error is logged and mapped to 502', async () => {
  const logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.mocked(global.fetch).mockImplementation(async () => new Response(JSON.stringify({ code: 'CONFIG_ERROR' }), { status: 500 }));
  const sdk = await createSdk();
  const response = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${await createTestToken('j3')}`));
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ code: 'UPSTREAM_ERROR' });
  expect(logSpy).toHaveBeenCalledWith('[mythos]', expect.stringContaining('session: consume returned 500'), expect.objectContaining({ code: 'CONFIG_ERROR' }));
});

test('JWKS network failure returns a logged 503', async () => {
  const sdk = await createSdk();
  const jwksCache = await import('../src/jwks-cache');
  jest.mocked(jwksCache.getKeySet).mockRejectedValueOnce(new Error('ECONNREFUSED'));
  const logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const response = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${await createTestToken('j3')}`));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: 'MYTHOS_UNREACHABLE' });
  expect(logSpy).toHaveBeenCalledWith('[mythos]', expect.stringContaining('session: could not verify launch token'), expect.any(Error));
});

test('expired launch token reload succeeds when its jti matches the valid cookie', async () => {
  const sdk = await createSdk();
  const first = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${await createTestToken('j1')}`));
  const expiredToken = await createTestToken('j1', Math.floor(Date.now() / 1000) - 60);
  const reloaded = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${expiredToken}`, cookiePair(first)));
  expect(reloaded.status).toBe(200);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('http development cookie uses SameSite=Lax without Secure', async () => {
  const sdk = await createSdk();
  const response = await sdk.handle(sessionRequest(`http://localhost/api/mythos/session?lt=${await createTestToken('j1')}`));
  const cookie = response.headers.getSetCookie()[0] ?? '';
  expect(cookie).toContain('SameSite=Lax');
  expect(cookie).not.toContain('Secure');
});

test('charge maps insufficient funds and expired session codes', async () => {
  const sdk = await createSdk();
  const launch = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${await createTestToken('j1')}`));
  const cookie = cookiePair(launch);
  jest.mocked(global.fetch).mockImplementationOnce(async () => new Response(JSON.stringify({ code: 'INSUFFICIENT_FUNDS' }), { status: 402 }));
  await expect(sdk.charge(sessionRequest('https://app.test', cookie), { credits: 1 }))
    .rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS', httpStatus: 402 });
  jest.mocked(global.fetch).mockImplementationOnce(async () => new Response(JSON.stringify({ code: 'SESSION_EXPIRED' }), { status: 404 }));
  await expect(sdk.charge(sessionRequest('https://app.test', cookie), { credits: 1 }))
    .rejects.toMatchObject({ code: 'SESSION_EXPIRED', httpStatus: 401 });
});

test('llm is lazy and billing metadata is available on core', async () => {
  const sdk = await createSdk();
  const launch = await sdk.handle(sessionRequest(`https://app.test/api/mythos/session?lt=${await createTestToken('j1')}`));
  const client = await sdk.llm(sessionRequest('https://app.test', cookiePair(launch)), { apiKey: 'sk-test' });
  expect(client).toMatchObject({ baseURL: 'https://api.mythos.work/v1' });
  await expect(sdk.llm(sessionRequest('https://app.test'), { fallback: 'FB' })).resolves.toBe('FB');
  expect(sdk.billing({ mythos_cost_microunits: '5', mythos_pricing_source: 'rate_card' }))
    .toMatchObject({ mythos_cost_microunits: '5', mythos_pricing_source: 'rate_card' });
});

test('handshake preserves legacy response shape', async () => {
  const sdk = await createSdk();
  const missing = await sdk.handle(new Request('https://app.test/.well-known/mythos-handshake'));
  expect(missing.status).toBe(401);
  expect(await missing.json()).toEqual({ error: 'Missing launch token' });
  const handshakeToken = await createTestToken('handshake-1', '5m', 'handshake-check');
  const response = await sdk.handle(new Request(`https://app.test/.well-known/mythos-handshake?lt=${handshakeToken}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, sdk_version: '0.1.1' });
});

test('listing-registered is unavailable unless a callback is configured', async () => {
  const sdk = await createSdk();
  const response = await sdk.handle(new Request('https://app.test/api/mythos/listing-registered?lt=unused'));
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' });
});

test('listing-registered GET and POST validate token and call callback', async () => {
  const onListingRegistered = jest.fn(async (_listingId: string) => undefined);
  const sdk = await createSdk({ onListingRegistered });
  const launchToken = await createTestToken('listing-registered-1', '5m', 'listing_registered');

  const getResponse = await sdk.handle(
    new Request(`https://app.test/.well-known/mythos-listing-registered?lt=${launchToken}`),
  );
  const postResponse = await sdk.handle(
    new Request(`https://app.test/.well-known/mythos-listing-registered?lt=${launchToken}`, { method: 'POST' }),
  );

  expect(getResponse.status).toBe(200);
  expect(await getResponse.json()).toEqual({ ok: true });
  expect(postResponse.status).toBe(200);
  expect(await postResponse.json()).toEqual({ ok: true });
  expect(onListingRegistered).toHaveBeenNthCalledWith(1, 'listing-abc');
  expect(onListingRegistered).toHaveBeenNthCalledWith(2, 'listing-abc');
});
