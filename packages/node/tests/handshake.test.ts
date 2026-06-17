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

async function mintHandshakeToken(overrides: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({ purpose: 'handshake-check', sub: 'listing-abc', ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(privateKey);
}

test('valid handshake token → 200 ok:true with sdk_version', async () => {
  const { handshakeRoute } = await import('../src/handshake');
  const token = await mintHandshakeToken();
  const req = mockReq(token);
  const res = mockRes();

  await handshakeRoute()(req, res, jest.fn() as never);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ ok: true, sdk_version: expect.any(String) }),
  );
  expect(res.status).not.toHaveBeenCalled();
});

test('missing ?lt= → 401', async () => {
  const { handshakeRoute } = await import('../src/handshake');
  const req = mockReq();
  const res = mockRes();

  await handshakeRoute()(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: 'Missing launch token' });
});

test('expired token → 401', async () => {
  const { handshakeRoute } = await import('../src/handshake');
  const token = await new SignJWT({ purpose: 'handshake-check', sub: 'listing-abc' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setExpirationTime('-1s')
    .sign(privateKey);
  const req = mockReq(token);
  const res = mockRes();

  await handshakeRoute()(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: 'Invalid launch token' });
});

test('wrong purpose → 401', async () => {
  const { handshakeRoute } = await import('../src/handshake');
  const token = await mintHandshakeToken({ purpose: 'launch' });
  const req = mockReq(token);
  const res = mockRes();

  await handshakeRoute()(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: 'Invalid launch token' });
});

test('no purpose claim → 401', async () => {
  const { handshakeRoute } = await import('../src/handshake');
  const token = await new SignJWT({ sub: 'listing-abc' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(privateKey);
  const req = mockReq(token);
  const res = mockRes();

  await handshakeRoute()(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: 'Invalid launch token' });
});

test('stale JWKS kid triggers fallback → 200', async () => {
  const { handshakeRoute } = await import('../src/handshake');
  const { createLocalJWKSet, generateKeyPair, exportJWK } = await import('jose');

  const staleKp = await generateKeyPair('RS256', { modulusLength: 2048 });
  const staleJwk = await exportJWK(staleKp.publicKey);
  staleJwk.kid = 'stale-kid';
  staleJwk.alg = 'RS256';
  const staleKeySet = createLocalJWKSet({ keys: [staleJwk] });
  (jwksCache.getKeySet as jest.Mock).mockResolvedValueOnce(staleKeySet);

  const token = await mintHandshakeToken();
  const req = mockReq(token);
  const res = mockRes();

  await handshakeRoute()(req, res, jest.fn() as never);

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  expect(res.status).not.toHaveBeenCalled();
});

test('JWKS fetch failure → 503', async () => {
  const { handshakeRoute } = await import('../src/handshake');
  (jwksCache.getKeySet as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

  const token = await mintHandshakeToken();
  const req = mockReq(token);
  const res = mockRes();

  await handshakeRoute()(req, res, jest.fn() as never);

  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: 'Service unavailable' });
});
