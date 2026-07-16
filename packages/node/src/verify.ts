import { jwtVerify } from 'jose';
import { getKeySet, getKeySetWithKidFallback } from './jwks-cache';
import { loadConfig } from './config';
import type { MythosSession } from './types';

// Matches backend's HANDSHAKE_ISS_CLAIM constant — the platform issuer is a
// fixed identifier, not the API URL (which varies by environment).
const MYTHOS_ISSUER = 'mythos';

function validateAudience(aud: unknown, listingIds: string[]): void {
  if (aud === undefined || aud === null) {
    throw new Error('Missing audience claim');
  }
  const audValues = Array.isArray(aud) ? aud : [aud];
  if (!audValues.some((a) => typeof a === 'string' && listingIds.includes(a))) {
    throw new Error('Token audience does not match configured listing ID');
  }
}

export async function verifyLaunchToken(
  token: string,
  options?: { resolveListingIds?: () => Promise<string[]> },
): Promise<MythosSession> {
  const { listingIds, apiUrl } = loadConfig();

  let keySet = await getKeySet(apiUrl);

  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySet, {
      algorithms: ['RS256'],
      issuer: MYTHOS_ISSUER,
    }));
  } catch (err: unknown) {
    const isKidError =
      err instanceof Error && err.message.includes('no applicable key found');
    if (!isKidError) throw err;

    // kid miss — re-fetch once
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
  validateAudience(payload.aud, [...listingIds, ...dynamicIds]);

  return {
    userId: payload.sub as string,
    email: payload['email'] as string,
    displayName: payload['displayName'] as string,
    listingId: payload['listingId'] as string,
    sessionJti: payload.jti as string,
  };
}
