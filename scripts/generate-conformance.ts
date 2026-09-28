/** Run after `npm run build` in packages/node: `node scripts/generate-conformance.ts` from the repo root. */
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

// Use the built SDK sealer, not a second cryptographic implementation.
const { sealSessionWithIv } = require('../packages/node/dist/session');

const secret = 'conformance-secret-0123456789abcdef0123';
const expiry = '2099-01-01T00:00:00.000Z';
const full = {
  userId: 'consumer-123', email: 'consumer@example.com', displayName: 'Café Consumer',
  listingId: 'listing-456', sessionJti: 'session-789',
  llmIdentityToken: 'identity.jwt.token', llmIdentityExpiresAt: '2098-12-31T23:30:00.000Z',
  expiresAt: expiry,
};
const noIdentity = {
  userId: 'consumer-123', email: 'consumer@example.com', displayName: 'Café Consumer',
  listingId: 'listing-456', sessionJti: 'session-789', expiresAt: expiry,
};

process.env.MYTHOS_SESSION_SECRET = secret;
const valid = [
  { name: 'full', iv_hex: '000102030405060708090a0b', payload: full },
  { name: 'no-identity', iv_hex: '0b0a09080706050403020100', payload: noIdentity },
].map(({ name, iv_hex, payload }) => ({
  name, iv_hex, payload, token: sealSessionWithIv(payload, Buffer.from(iv_hex, 'hex')),
}));

const tampered = Buffer.from(valid[0].token.slice(3), 'base64url');
tampered[15] ^= 1;
process.env.MYTHOS_SESSION_SECRET = `${secret}-wrong`;
const wrongSecret = sealSessionWithIv(full, Buffer.from(valid[0].iv_hex, 'hex'));
const expired = { ...full, expiresAt: '2000-01-01T00:00:00.000Z' };
process.env.MYTHOS_SESSION_SECRET = secret;

const fixtures = {
  secret,
  valid,
  invalid: [
    { name: 'tampered', token: `v1.${tampered.toString('base64url')}` },
    { name: 'legacy-unprefixed', token: valid[0].token.slice(3) },
    { name: 'expired', token: sealSessionWithIv(expired, Buffer.from(valid[0].iv_hex, 'hex')) },
    { name: 'wrong-secret', token: wrongSecret },
  ],
};
writeFileSync(join(__dirname, '../conformance/session-v1.json'), `${JSON.stringify(fixtures, null, 2)}\n`);
