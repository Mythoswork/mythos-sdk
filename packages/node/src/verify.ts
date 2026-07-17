import { jwtVerify, errors, type JWTPayload } from 'jose';
import { getKeySet, getKeySetWithKidFallback } from './jwks-cache';
import { loadConfig } from './config';
import { InvalidLaunchTokenError } from './errors';
import type { MythosSession } from './types';

// Matches backend's HANDSHAKE_ISS_CLAIM constant — the platform issuer is a
// fixed identifier, not the API URL (which varies by environment).
const MYTHOS_ISSUER = 'mythos';

function requireStringClaim(payload: JWTPayload, claim: string): string {
  const value = payload[claim];
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidLaunchTokenError(`Missing ${claim} claim`);
  }
  return value;
}

function validateAudience(payload: JWTPayload, listingIds: string[]): void {
  const aud = payload.aud;
  if (!aud) {
    throw new InvalidLaunchTokenError('Missing audience claim');
  }
  const audValues = Array.isArray(aud) ? aud : [aud];
  if (!audValues.some((value) => listingIds.includes(value))) {
    throw new InvalidLaunchTokenError('Invalid audience');
  }
}

function buildSession(payload: JWTPayload, listingIds: string[]): MythosSession {
  validateAudience(payload, listingIds);

  const listingId = requireStringClaim(payload, 'listingId');
  if (!listingIds.includes(listingId)) {
    throw new InvalidLaunchTokenError('listingId does not match configured listing ID');
  }

  return {
    userId: requireStringClaim(payload, 'sub'),
    email: requireStringClaim(payload, 'email'),
    displayName: requireStringClaim(payload, 'displayName'),
    listingId,
    sessionJti: requireStringClaim(payload, 'jti'),
  };
}

export async function verifyLaunchToken(
  token: string,
  options?: { resolveListingIds?: () => Promise<string[]> },
): Promise<MythosSession> {
  const { listingIds, apiUrl } = loadConfig();

  let keySet = await getKeySet(apiUrl);

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keySet, {
      algorithms: ['RS256'],
      issuer: MYTHOS_ISSUER,
    }));
  } catch (err: unknown) {
    if (!(err instanceof errors.JWKSNoMatchingKey)) throw err;

    keySet = await getKeySetWithKidFallback(apiUrl);
    ({ payload } = await jwtVerify(token, keySet, {
      algorithms: ['RS256'],
      issuer: MYTHOS_ISSUER,
    }));
  }

  const dynamicIds = options?.resolveListingIds ? await options.resolveListingIds() : [];
  if (listingIds.length === 0 && dynamicIds.length === 0) {
    throw new Error('MYTHOS_LISTING_ID or MYTHOS_LISTING_IDS env var is required, or pass resolveListingIds');
  }
  const allListingIds = [...listingIds, ...dynamicIds];
  validateAudience(payload, allListingIds);

  return buildSession(payload, allListingIds);
}
