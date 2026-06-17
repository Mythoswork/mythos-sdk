import { jwtVerify } from 'jose';
import type { RequestHandler } from 'express';
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
    const isKidError = err instanceof Error && err.message.includes('no applicable key found');
    if (!isKidError) throw err;
    keySet = await getKeySetWithKidFallback(apiUrl);
    ({ payload } = await jwtVerify(token, keySet, { algorithms: ['RS256'] }));
  }

  if (payload['purpose'] !== 'handshake-check') {
    throw new Error('Token purpose is not handshake-check');
  }
}

export function handshakeRoute(): RequestHandler {
  return async (req, res) => {
    const token = req.query['lt'] as string | undefined;
    if (!token) {
      res.status(401).json({ error: 'Missing launch token' });
      return;
    }
    try {
      await validateHandshakeToken(token);
    } catch {
      res.status(401).json({ error: 'Invalid launch token' });
      return;
    }
    res.json({ ok: true, sdk_version: SDK_VERSION });
  };
}
