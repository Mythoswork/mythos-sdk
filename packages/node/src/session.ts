import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

import { MythosConfigError } from './errors';
import type { MythosSession } from './types';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface StoredSession extends MythosSession {
  expiresAt: string;
}

function getSessionKey(): Buffer {
  const secret = process.env.MYTHOS_SESSION_SECRET;
  if (!secret) {
    throw new MythosConfigError('MYTHOS_SESSION_SECRET env var is required to encode/decode a Mythos session');
  }
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a MythosSession (including its LLM identity token) into a compact, tamper-proof
 * string sized to fit an HttpOnly cookie. This is what lets a Producer app support any
 * number of its own routes off a single launch/consume, instead of re-verifying the launch
 * token -- which is single-use -- on every page. The Producer sets the returned string as
 * its own cookie (recommended: HttpOnly; Secure; SameSite=Lax); decodeSession() reads it
 * back on any later request with no call to Mythos at all.
 *
 * NOT cross-language compatible with the Python SDK's encode_session/decode_session, even
 * with the same MYTHOS_SESSION_SECRET: this writes iv(12) || authTag(16) || ciphertext,
 * while Python's AESGCM.encrypt() produces ciphertext || tag(16), giving a different byte
 * layout under the same field names. A Producer app must encode and decode its session
 * cookie with the same language's SDK throughout -- there is no supported mixed-language
 * deployment for a single cookie.
 */
export function encodeSession(session: MythosSession): string {
  const key = getSessionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(session), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64url');
}

/**
 * Decrypts a value produced by encodeSession(). Returns null for anything that isn't a
 * currently-valid session -- tampered, malformed, or past its own llmIdentityExpiresAt --
 * rather than throwing, since "no valid session" is an expected, ordinary outcome for a
 * caller (e.g. redirect back through launch again), not an error condition. A missing
 * MYTHOS_SESSION_SECRET is a real misconfiguration and still throws MythosConfigError.
 */
export function decodeSession(token: string): MythosSession | null {
  const key = getSessionKey();
  try {
    const raw = Buffer.from(token, 'base64url');
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const session = JSON.parse(plaintext.toString('utf8')) as MythosSession;

    if (session.llmIdentityExpiresAt) {
      const expiresAtMs = new Date(session.llmIdentityExpiresAt).getTime();
      // A malformed date string parses to NaN, and NaN <= anything is always false -- so
      // this must be checked explicitly, otherwise a malformed expiry fails open (treated
      // as "not expired") instead of closed like Python's equivalent check.
      if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
        return null;
      }
    }
    return session;
  } catch {
    return null;
  }
}

export function sealSession(session: StoredSession): string {
  const key = getSessionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(session), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64url');
}

export function openSession(token: string): StoredSession | null {
  const key = getSessionKey();
  try {
    const raw = Buffer.from(token, 'base64url');
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const session: unknown = JSON.parse(plaintext.toString('utf8'));
    if (typeof session !== 'object' || session === null || Array.isArray(session)) return null;
    const stored = session as StoredSession;
    const expiresAtMs = typeof stored.expiresAt === 'string' ? Date.parse(stored.expiresAt) : Number.NaN;
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) return null;
    return stored;
  } catch {
    return null;
  }
}
