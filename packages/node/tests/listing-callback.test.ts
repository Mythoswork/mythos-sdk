import { SignJWT, generateKeyPair, exportJWK, type KeyLike } from 'jose';
import * as jwksCache from '../src/jwks-cache';
import type { Request, Response as ExpressResponse } from 'express';

let privateKey: KeyLike;

function mockRes(): ExpressResponse {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as ExpressResponse;
}

function mockReq(lt?: string): Request {
  return { query: lt !== undefined ? { lt } : {} } as unknown as Request;
}

beforeAll(async () => {
  const kp = await generateKeyPair('RS256', { modulusLength: 2048 });
  privateKey = kp.privateKey;
  const publicKey = kp.publicKey;

  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-kid';
  jwk.alg = 'RS256';

  const { createLocalJWKSet } = await import('jose');
  const keySet = createLocalJWKSet({ keys: [jwk] });
  jest.spyOn(jwksCache, 'getKeySet').mockResolvedValue(keySet as never);
  jest.spyOn(jwksCache, 'getKeySetWithKidFallback').mockResolvedValue(keySet as never);
});

beforeEach(() => {
  process.env.MYTHOS_API_URL = 'https://api.mythos.work';
});

async function mintCallbackToken(overrides: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({ purpose: 'listing_registered', listingId: 'listing-xyz', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setExpirationTime('2m')
    .sign(privateKey);
}

test('valid callback token → onRegistered called with listingId → 200 ok', async () => {
  const { listingCallbackRoute } = await import('../src/listing-callback');
  const token = await mintCallbackToken();
  const req = mockReq(token);
  const res = mockRes();
  const onRegistered = jest.fn().mockResolvedValue(undefined);

  await listingCallbackRoute(onRegistered)(req, res, jest.fn() as never);

  expect(onRegistered).toHaveBeenCalledWith('listing-xyz');
  expect(res.json).toHaveBeenCalledWith({ ok: true });
  expect(res.status).not.toHaveBeenCalled();
});

test('missing ?lt= → 401', async () => {
  const { listingCallbackRoute } = await import('../src/listing-callback');
  const req = mockReq();
  const res = mockRes();
  const onRegistered = jest.fn();

  await listingCallbackRoute(onRegistered)(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: 'Missing listing callback token' });
  expect(onRegistered).not.toHaveBeenCalled();
});

test('expired token → 401', async () => {
  const { listingCallbackRoute } = await import('../src/listing-callback');
  const token = await new SignJWT({ purpose: 'listing_registered', listingId: 'listing-xyz' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setExpirationTime('-1s')
    .sign(privateKey);
  const req = mockReq(token);
  const res = mockRes();
  const onRegistered = jest.fn();

  await listingCallbackRoute(onRegistered)(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: 'Invalid listing callback token' });
});

test('wrong purpose → 401', async () => {
  const { listingCallbackRoute } = await import('../src/listing-callback');
  const token = await mintCallbackToken({ purpose: 'handshake-check' });
  const req = mockReq(token);
  const res = mockRes();
  const onRegistered = jest.fn();

  await listingCallbackRoute(onRegistered)(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: 'Invalid listing callback token' });
});

test('no purpose claim → 401', async () => {
  const { listingCallbackRoute } = await import('../src/listing-callback');
  const token = await new SignJWT({ listingId: 'listing-xyz' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setIssuer('mythos')
    .setExpirationTime('2m')
    .sign(privateKey);
  const req = mockReq(token);
  const res = mockRes();
  const onRegistered = jest.fn();

  await listingCallbackRoute(onRegistered)(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: 'Invalid listing callback token' });
});

test('stale JWKS kid triggers fallback → 200', async () => {
  const { listingCallbackRoute } = await import('../src/listing-callback');
  const { createLocalJWKSet, generateKeyPair: gen, exportJWK: expJwk } = await import('jose');

  const staleKp = await gen('RS256', { modulusLength: 2048 });
  const staleJwk = await expJwk(staleKp.publicKey);
  staleJwk.kid = 'stale-kid';
  staleJwk.alg = 'RS256';
  const staleKeySet = createLocalJWKSet({ keys: [staleJwk] });
  (jwksCache.getKeySet as jest.Mock).mockResolvedValueOnce(staleKeySet);

  const token = await mintCallbackToken();
  const req = mockReq(token);
  const res = mockRes();
  const onRegistered = jest.fn().mockResolvedValue(undefined);

  await listingCallbackRoute(onRegistered)(req, res, jest.fn() as never);

  expect(onRegistered).toHaveBeenCalledWith('listing-xyz');
  expect(res.json).toHaveBeenCalledWith({ ok: true });
  expect(res.status).not.toHaveBeenCalled();
});

test('onRegistered rejects → 503', async () => {
  const { listingCallbackRoute } = await import('../src/listing-callback');
  const token = await mintCallbackToken();
  const req = mockReq(token);
  const res = mockRes();
  const onRegistered = jest.fn().mockRejectedValue(new Error('DB write failed'));

  await listingCallbackRoute(onRegistered)(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: 'Service unavailable' });
});

test('JWKS fetch failure → 503', async () => {
  const { listingCallbackRoute } = await import('../src/listing-callback');
  (jwksCache.getKeySet as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

  const token = await mintCallbackToken();
  const req = mockReq(token);
  const res = mockRes();
  const onRegistered = jest.fn();

  await listingCallbackRoute(onRegistered)(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: 'Service unavailable' });
});
