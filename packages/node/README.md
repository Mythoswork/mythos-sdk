# @mythos-work/sdk

Official Mythos SDK for Node.js — launch token verification, usage reporting, and handshake.

## Install

```bash
npm install @mythos-work/sdk
```

## Quick start

```typescript
import { requireLaunchToken, reportUsage, handshakeRoute, listingCallbackRoute } from '@mythos-work/sdk';
import express from 'express';

const app = express();
const listingIds = new Set<string>(); // populated by listingCallbackRoute

// Handshake endpoint — Mythos pings this before publishing your listing
app.use(handshakeRoute());

// Listing registration callback — Mythos calls this after your listing is registered
app.post('/.well-known/mythos-listing-registered', listingCallbackRoute(async (listingId) => {
  listingIds.add(listingId); // persist so resolveListingIds can read it
}));

// Protected route — verifies and consumes the launch token automatically
app.get(
  '/dashboard',
  requireLaunchToken({ resolveListingIds: async () => Array.from(listingIds) }),
  async (req, res) => {
    // req.mythos = { userId, email, displayName, listingId, sessionJti }
    await reportUsage(req.mythos.sessionJti, { credits: 1, reason: 'page-view' });
    res.json({ ok: true });
  },
);
```

## Environment variables

| Variable             | Required | Default                   | Description                                   |
| ----------------------| ----------| ---------------------------| -----------------------------------------------|
| `MYTHOS_LISTING_ID`  | No*      | —                         | Your listing ID                               |
| `MYTHOS_LISTING_IDS` | No*      | —                         | Comma-separated listing IDs (overrides above) |
| `MYTHOS_API_URL`     | No       | `https://api.mythos.work` | API base URL override                         |

*Optional when you provide `resolveListingIds`; otherwise one of `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` is required.

## API

### `requireLaunchToken({ resolveListingIds? })`

Express middleware. Verifies the RS256 launch token from `?lt=`, enforces single-use semantics, and attaches `req.mythos` to the request. Listing IDs are read from `MYTHOS_LISTING_ID(S)` by default; pass `resolveListingIds` to supply them dynamically (e.g. from storage populated by `listingCallbackRoute`). Returns `401` if the token is missing, invalid, or already consumed.

### `reportUsage(sessionJti, { credits, reason? })`

Reports credit consumption against a session. Call after delivering value to the user.

### `handshakeRoute()`

Returns an Express `Router` that mounts `GET /.well-known/mythos-handshake`. Use `app.use(handshakeRoute())` so the backend can reach the designated address during listing publish.

### `listingCallbackRoute(onRegistered)`

Returns an Express `RequestHandler`. Mount it at the listing callback URL you configure. It validates the `?lt=` token, calls `onRegistered(listingId)` on success, and responds with `{ ok: true }`. Use the callback to persist the listing ID so `resolveListingIds` can read it. Returns `401` for missing/invalid tokens and `503` for unexpected errors.

### `verifyLaunchToken(token, { resolveListingIds? })`

Low-level token verifier. Validates the launch token and returns the decoded `MythosSession`. Listing IDs are read from `MYTHOS_LISTING_ID(S)` by default; pass `resolveListingIds` to supply them dynamically. Use `requireLaunchToken()` middleware instead for most cases.

## Security

- Tokens verified via RS256 against the Mythos JWKS endpoint
- `alg: none` rejected as a hard block
- Single-use enforcement is non-skippable (ADR-0003)
- JWKS keys cached 10 minutes with automatic re-fetch on key rotation

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
