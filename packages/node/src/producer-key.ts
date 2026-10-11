import { createHash } from 'node:crypto';

import type { JWTPayload } from 'jose';

import { MALFORMED_PRODUCER_KEY_MESSAGE, MISSING_PRODUCER_KEY_WARNING, PRODUCER_KEY_PATTERN } from './constants/producer-key.constants';
import { MythosConfigError, ProducerMismatchError } from './errors';
import { mythosLog } from './logger';

export { PRODUCER_KEY_PATTERN } from './constants/producer-key.constants';

let hasWarnedMissingProducerKey = false;

export function hashProducerKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('base64url');
}

export function readProducerKey(): string | undefined {
  return process.env.MYTHOS_KEY?.trim() || undefined;
}

export function assertProducerKeyFormat(): void {
  const key = readProducerKey();
  if (key && !PRODUCER_KEY_PATTERN.test(key)) throw new MythosConfigError(MALFORMED_PRODUCER_KEY_MESSAGE);
}

export function warnMissingProducerKeyOnce(): void {
  if (hasWarnedMissingProducerKey) return;
  hasWarnedMissingProducerKey = true;
  mythosLog.warn(MISSING_PRODUCER_KEY_WARNING);
}

/** Throws ProducerMismatchError when a key is set and pkh doesn't match. */
export function assertProducerBinding(payload: JWTPayload): void {
  const key = readProducerKey();
  if (!key || payload.pkh === hashProducerKey(key)) return;
  const error = new ProducerMismatchError();
  // Handshake tokens carry the Listing ID in `sub`, not `listingId`.
  const listingId = payload.listingId ?? payload.sub;
  error.listingId = typeof listingId === 'string' ? listingId : undefined;
  throw error;
}
