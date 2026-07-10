import { jwtVerify, errors } from 'jose';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { getKeySet, getKeySetWithKidFallback } from './jwks-cache';

const SDK_VERSION = '0.1.0';
const DEFAULT_API_URL = 'https://api.mythos.work';

async function validateHandshakeToken(token: string): Promise<void> {
  const apiUrl = process.env.MYTHOS_API_URL ?? DEFAULT_API_URL;
  let keySet = await getKeySet(apiUrl);

  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySet, { algorithms: ['RS256'] }));
  } catch (err: unknown) {
    if (!(err instanceof errors.JWKSNoMatchingKey)) throw err;
    keySet = await getKeySetWithKidFallback(apiUrl);
    ({ payload } = await jwtVerify(token, keySet, { algorithms: ['RS256'] }));
  }

  if (payload['purpose'] !== 'handshake-check') {
    throw new errors.JWTClaimValidationFailed(
      'Token purpose is not handshake-check',
      payload,
      'purpose',
      'check',
    );
  }
}

export function handshakeRoute(): Router {
  const router = Router();

  router.get('/.well-known/mythos-handshake', async (req: Request, res: Response) => {
    const raw = req.query['lt'];
    const first = Array.isArray(raw) ? raw[0] : raw;
    const token = typeof first === 'string' ? first : undefined;
    if (!token) {
      res.status(401).json({ error: 'Missing launch token' });
      return;
    }
    try {
      await validateHandshakeToken(token);
    } catch (err) {
      if (err instanceof errors.JOSEError) {
        res.status(401).json({ error: 'Invalid launch token' });
      } else {
        console.error('[mythos-sdk] handshake: unexpected error', err);
        res.status(503).json({ error: 'Service unavailable' });
      }
      return;
    }
    res.json({ ok: true, sdk_version: SDK_VERSION });
  });

  return router;
}
