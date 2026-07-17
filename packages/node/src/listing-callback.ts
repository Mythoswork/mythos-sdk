import { jwtVerify, errors } from 'jose';
import type { RequestHandler } from 'express';
import { getKeySet, getKeySetWithKidFallback } from './jwks-cache';

const MYTHOS_ISSUER = 'mythos';
const DEFAULT_API_URL = 'https://api.mythos.work';

async function validateListingCallbackToken(token: string): Promise<string> {
  const apiUrl = process.env.MYTHOS_API_URL ?? DEFAULT_API_URL;
  let keySet = await getKeySet(apiUrl);

  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySet, { algorithms: ['RS256'], issuer: MYTHOS_ISSUER }));
  } catch (err: unknown) {
    if (!(err instanceof errors.JWKSNoMatchingKey)) throw err;
    keySet = await getKeySetWithKidFallback(apiUrl);
    ({ payload } = await jwtVerify(token, keySet, { algorithms: ['RS256'], issuer: MYTHOS_ISSUER }));
  }

  if (payload['purpose'] !== 'listing_registered') {
    throw new errors.JWTClaimValidationFailed(
      'Token purpose is not listing_registered',
      payload,
      'purpose',
      'check',
    );
  }

  return payload['listingId'] as string;
}

export function listingCallbackRoute(
  onRegistered: (listingId: string) => Promise<void>,
): RequestHandler {
  return async (req, res) => {
    const raw = req.query['lt'];
    const first = Array.isArray(raw) ? raw[0] : raw;
    const token = typeof first === 'string' ? first : undefined;
    if (!token) {
      res.status(401).json({ error: 'Missing listing callback token' });
      return;
    }
    try {
      const listingId = await validateListingCallbackToken(token);
      await onRegistered(listingId);
    } catch (err) {
      if (err instanceof errors.JOSEError) {
        res.status(401).json({ error: 'Invalid listing callback token' });
      } else {
        console.error('[mythos-sdk] listing-callback: unexpected error', err);
        res.status(503).json({ error: 'Service unavailable' });
      }
      return;
    }
    res.json({ ok: true });
  };
}
