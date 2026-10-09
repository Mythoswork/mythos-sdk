import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { SignJWT, exportJWK, generateKeyPair, type JWTPayload, type KeyLike } from 'jose';

import type { Mythos } from '../src/mythos';

const OWN_KEY = `mk_${'a'.repeat(32)}`;
const OTHER_KEY = `mk_${'b'.repeat(32)}`;
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
let privateKey: KeyLike;
let jwk: Awaited<ReturnType<typeof exportJWK>>;
let fetchMock: jest.MockedFunction<typeof fetch>;
let sdk: Mythos;
let logs: jest.SpyInstance[];

beforeAll(async () => {
  const keys = await generateKeyPair('ES256');
  privateKey = keys.privateKey;
  jwk = { ...await exportJWK(keys.publicKey), kid: 'diagnostics', alg: 'ES256' };
});

beforeEach(async () => {
  jest.resetModules();
  process.env.MYTHOS_KEY = OWN_KEY;
  process.env.MYTHOS_LISTING_ID = 'listing-a';
  delete process.env.MYTHOS_LISTING_IDS;
  process.env.MYTHOS_SESSION_SECRET = 's'.repeat(32);
  process.env.MYTHOS_API_URL = 'https://api.mythos.work';
  const { mythosLog } = await import('../src/logger');
  logs = ['warn', 'error', 'debug'].map((level) =>
    jest.spyOn(mythosLog, level as 'warn' | 'error' | 'debug').mockImplementation(() => undefined));
  fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ success: true, data: {
    llm_identity_token: 'private-identity', llm_identity_expires_at: '2099-01-01T00:00:00Z',
    session_expires_at: '2099-01-01T00:00:00Z',
  } })));
  globalThis.fetch = fetchMock;
  const cache = await import('../src/jwks-cache');
  const { createLocalJWKSet } = await import('jose');
  jest.spyOn(cache, 'getKeySet').mockResolvedValue(createLocalJWKSet({ keys: [jwk] }));
  sdk = (await import('../src/mythos')).createMythos();
});

afterEach(() => {
  jest.restoreAllMocks();
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

async function mint(overrides: JWTPayload = {}): Promise<string> {
  const { hashProducerKey } = await import('../src/producer-key');
  return new SignJWT({
    sub: 'private-user', email: 'private@example.test', displayName: 'Private Person',
    listingId: 'listing-a', pkh: hashProducerKey(OWN_KEY), test: true, ...overrides,
  }).setProtectedHeader({ alg: 'ES256', kid: 'diagnostics' }).setIssuer('mythos')
    .setAudience(String(overrides.aud ?? 'listing-a')).setJti('diagnostic-jti')
    .setExpirationTime('5m').sign(privateKey);
}

function launch(token: string, headers?: HeadersInit): Request {
  return new Request(`https://app.test/api/mythos/session?lt=${encodeURIComponent(token)}`, { headers });
}

function reports() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/diagnostics'));
}

function expectReport(code: string, step: string): void {
  expect(reports()).toHaveLength(1);
  const [url, init] = reports()[0];
  expect(url).toBe('https://api.mythos.work/api/apps/sessions/diagnostic-jti/diagnostics');
  expect(init?.method).toBe('POST');
  expect(new Headers(init?.headers)).toEqual(new Headers({ 'content-type': 'application/json' }));
  expect(JSON.parse(String(init?.body))).toEqual({ code, step, sdk_version: '0.5.1' });
}

test.each([true, false, undefined, 'true', 1])('wrong producer reports only literal test:true (%s)', async (testClaim) => {
  const { hashProducerKey } = await import('../src/producer-key');
  const token = await mint({ test: testClaim, pkh: hashProducerKey(OTHER_KEY) });
  const response = await sdk.handle(launch(token));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ success: false, code: 'PRODUCER_MISMATCH',
    error: 'This app is bound to a different Mythos Producer. Check MYTHOS_KEY.' });
  expect(response.headers.has('set-cookie')).toBe(false);
  if (testClaim === true) expectReport('PRODUCER_MISMATCH', 'verify_launch');
  else expect(fetchMock).not.toHaveBeenCalled();
  const logOutput = JSON.stringify(logs.flatMap((log) => log.mock.calls));
  for (const value of [token, OWN_KEY, OTHER_KEY, 'private-user', 'private@example.test', 'Private Person']) {
    expect(logOutput).not.toContain(value);
    expect(JSON.stringify(reports().map(([, init]) => init?.body))).not.toContain(value);
  }
});

test('unregistered signed audience has a dedicated marker, not message matching', async () => {
  const token = await mint({ aud: 'unregistered', listingId: 'unregistered' });
  const response = await sdk.handle(launch(token));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'LISTING_NOT_REGISTERED' });
  expectReport('LISTING_NOT_REGISTERED', 'verify_launch');
  const { verifyLaunchToken } = await import('../src/verify');
  const { ListingNotRegisteredError, InvalidLaunchTokenError } = await import('../src/errors');
  await expect(verifyLaunchToken(token)).rejects.toBeInstanceOf(ListingNotRegisteredError);
  jest.spyOn(await import('../src/verify'), 'verifyLaunchToken').mockRejectedValue(new InvalidLaunchTokenError('Invalid audience'));
  fetchMock.mockClear();
  expect(await (await sdk.handle(launch(token))).json()).toMatchObject({ code: 'INVALID_LAUNCH_TOKEN' });
  expectReport('INVALID_LAUNCH_TOKEN', 'verify_launch');
});

test.each([
  [409, undefined, 'TOKEN_ALREADY_CONSUMED', 401],
  [404, 'SESSION_EXPIRED', 'SESSION_EXPIRED', 401],
  [500, 'OTHER', 'UPSTREAM_ERROR', 502],
] as const)('consume %s maps to %s and reports consume', async (status, upstreamCode, code, expectedStatus) => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: upstreamCode }), { status }));
  const response = await sdk.handle(launch(await mint()));
  expect(response.status).toBe(expectedStatus);
  expect(await response.json()).toMatchObject({ code });
  expectReport(code, 'consume');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('consume network failure reports once', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('network unavailable'));
  const response = await sdk.handle(launch(await mint()));
  expect(response.status).toBe(503);
  expectReport('MYTHOS_UNREACHABLE', 'consume');
});

test.each([true, false])('signed invalid claims report only for a test launch (%s)', async (isTest) => {
  const response = await sdk.handle(launch(await mint({ test: isTest, email: null })));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'INVALID_LAUNCH_TOKEN' });
  if (isTest) expectReport('INVALID_LAUNCH_TOKEN', 'verify_launch');
  else expect(fetchMock).not.toHaveBeenCalled();
});

test('real-session consume failure and malformed tokens never report', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
  expect((await sdk.handle(launch(await mint({ test: false })))).status).toBe(401);
  expect(reports()).toHaveLength(0);
  fetchMock.mockClear();
  expect((await sdk.handle(launch('not-a-token'))).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('JWKS network failure reports exactly once without consume', async () => {
  jest.mocked((await import('../src/jwks-cache')).getKeySet).mockRejectedValue(new TypeError('network unavailable'));
  const response = await sdk.handle(launch(await mint()));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: 'MYTHOS_UNREACHABLE' });
  expectReport('MYTHOS_UNREACHABLE', 'verify_launch');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('configuration failure after signed verification reports CONFIG_ERROR', async () => {
  delete process.env.MYTHOS_LISTING_ID;
  sdk = (await import('../src/mythos')).createMythos({ resolveListingIds: async () => [] });
  const response = await sdk.handle(launch(await mint()));
  expect(response.status).toBe(500);
  expectReport('CONFIG_ERROR', 'verify_launch');
});

test('report rejection is swallowed and cannot change app response or recurse', async () => {
  fetchMock.mockRejectedValue(new TypeError('private-token private@example.test'));
  const { hashProducerKey } = await import('../src/producer-key');
  const response = await sdk.handle(launch(await mint({ pkh: hashProducerKey(OTHER_KEY) })));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'PRODUCER_MISMATCH' });
  await new Promise<void>((done) => setImmediate(done));
  expectReport('PRODUCER_MISMATCH', 'verify_launch');
  expect(logs[2]).toHaveBeenCalledWith('diagnostics: report failed');
  expect(JSON.stringify(logs.flatMap((log) => log.mock.calls))).not.toContain('private-token');
});

test('two-second report timeout does not await the response or recurse', async () => {
  const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
  let didAbort = false;
  let finish: () => void = () => undefined;
  const aborted = new Promise<void>((done) => { finish = done; });
  fetchMock.mockImplementation(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      didAbort = true;
      reject(init.signal?.reason);
      finish();
    }, { once: true });
  }));
  const { hashProducerKey } = await import('../src/producer-key');
  const response = await sdk.handle(launch(await mint({ pkh: hashProducerKey(OTHER_KEY) })));
  expect(didAbort).toBe(false);
  expect(response.status).toBe(401);
  expect(timeoutSpy).toHaveBeenCalledWith(2_000);
  await aborted;
  await new Promise<void>((done) => setImmediate(done));
  expectReport('PRODUCER_MISMATCH', 'verify_launch');
  expect(fetchMock).toHaveBeenCalledTimes(1);
}, 5_000);

async function storedRequest(isTest: boolean): Promise<Request> {
  const response = await sdk.handle(launch(await mint({ test: isTest })));
  const body = await response.json() as { data: { sessionToken: string; session: Record<string, unknown> } };
  const stored = (await import('../src/session')).openSession(body.data.sessionToken);
  expect(stored?.isTest).toBe(isTest);
  expect(body.data.session).not.toHaveProperty('isTest');
  fetchMock.mockClear();
  return new Request('https://app.test/action', { headers: { 'x-mythos-session': body.data.sessionToken } });
}

test.each([true, false])('sealed test flag controls real meter 404 reporting (%s)', async (isTest) => {
  const request = await storedRequest(isTest);
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'SESSION_EXPIRED' }), { status: 404 }));
  await expect(sdk.charge(request, { credits: 1 })).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  if (isTest) expectReport('SESSION_EXPIRED', 'meter');
  else expect(reports()).toHaveLength(0);
});

test.each(['meter', 'llm'] as const)('%s rethrows the exact MythosError and reports only enum codes', async (step) => {
  const request = await storedRequest(true);
  const { MythosError } = await import('../src/errors');
  const error = new MythosError('private@example.test', 'SESSION_EXPIRED', 404);
  if (step === 'meter') jest.spyOn(await import('../src/api-client'), 'meterSession').mockRejectedValue(error);
  else jest.spyOn(await import('../src/llm'), 'llm').mockImplementation(() => { throw error; });
  const call = () => step === 'meter' ? sdk.charge(request, { credits: 1 }) : sdk.llm(request);
  await expect(call()).rejects.toBe(error);
  expectReport('SESSION_EXPIRED', step);
  expect(String(reports()[0][1]?.body)).not.toContain(error.message);
  fetchMock.mockClear();
  const unknown = new MythosError('Unknown', 'LLM_IDENTITY_REQUIRED');
  if (step === 'meter') jest.mocked((await import('../src/api-client')).meterSession).mockRejectedValue(unknown);
  else jest.mocked((await import('../src/llm')).llm).mockImplementation(() => { throw unknown; });
  await expect(call()).rejects.toBe(unknown);
  expect(reports()).toHaveLength(0);
});

test('real-session LLM failure rethrows unchanged without reporting', async () => {
  const request = await storedRequest(false);
  const { MythosError } = await import('../src/errors');
  const error = new MythosError('Expired', 'SESSION_EXPIRED', 401);
  jest.spyOn(await import('../src/llm'), 'llm').mockImplementation(() => { throw error; });
  await expect(sdk.llm(request)).rejects.toBe(error);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('handshake-shaped producer mismatch uses sub and logs listing only', async () => {
  const { assertProducerBinding } = await import('../src/producer-key');
  try {
    assertProducerBinding({ sub: 'listing-handshake', pkh: 'wrong' });
    throw new Error('Expected producer mismatch');
  } catch (error) {
    expect(error).toMatchObject({ code: 'PRODUCER_MISMATCH', listingId: 'listing-handshake' });
  }
  const token = await mint({ listingId: undefined, sub: 'listing-handshake', purpose: 'handshake-check', pkh: 'wrong' });
  const response = await sdk.handle(new Request(`https://app.test/api/mythos/handshake?lt=${token}`));
  expect(response.status).toBe(401);
  expect(logs[0]).toHaveBeenCalledWith('handshake: producer mismatch', { listingId: 'listing-handshake' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('release metadata, browser version and exact diagnostic documentation agree', async () => {
  const { SDK_VERSION } = await import('../src/version');
  const metadata = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as { version: string };
  expect(SDK_VERSION).toBe('0.5.1');
  expect(SDK_VERSION).toBe(metadata.version);
  const { DIAGNOSTIC_MESSAGES } = await import('../src/constants/diagnostics.constants');
  const docs = readFileSync(resolve(__dirname, '../../../docs-site/docs/resources/troubleshooting.md'), 'utf8');
  const python = readFileSync(resolve(__dirname, '../../python/mythos_sdk/constants/diagnostics.py'), 'utf8');
  expect(Object.keys(DIAGNOSTIC_MESSAGES)).toHaveLength(10);
  for (const [code, message] of Object.entries(DIAGNOSTIC_MESSAGES)) {
    expect(docs).toContain(`| \`${code}\` | ${message} |`);
    expect(python).toContain(`${JSON.stringify(code)}: ${JSON.stringify(message)}`);
  }
});

test('built browser-global handshake uses package version without Node built-ins', () => {
  const bundle = readFileSync(resolve(__dirname, '../dist/mythos-client.global.js'), 'utf8');
  const postMessage = jest.fn();
  const browser = { parent: { postMessage } };
  runInNewContext(`${bundle}; Mythos.sendHandshake('https://dashboard.mythos.work');`, { window: browser });
  expect(postMessage).toHaveBeenCalledWith({ type: 'mythos:handshake', sdk_version: '0.5.1' }, 'https://dashboard.mythos.work');
  expect(bundle).not.toMatch(/require\s*\(|node:|createRequire|__filename/);
  for (const name of ['index.js', 'mythos.js']) {
    const built = readFileSync(resolve(__dirname, '../dist', name), 'utf8');
    expect(built).not.toMatch(/require\(["']openai["']\)/);
  }
});
