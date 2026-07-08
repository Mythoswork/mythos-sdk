# @mythos-work/sdk

Official Mythos SDK for Node.js — launch token verification, usage reporting, and handshake.

## Install

```bash
npm install @mythos-work/sdk
```

## Quick start

```typescript
import { requireLaunchToken, reportUsage, handshakeRoute } from '@mythos-work/sdk';
import express from 'express';

const app = express();

// Handshake endpoint — Mythos pings this before publishing your listing
app.get('/.well-known/mythos-handshake', handshakeRoute());

// Protected route — verifies and consumes the launch token automatically
app.get('/dashboard', requireLaunchToken(), async (req, res) => {
  // req.mythos = { userId, email, displayName, listingId, sessionJti }
  await reportUsage(req.mythos.sessionJti, { credits: 1, reason: 'page-view' });
  res.json({ ok: true });
});
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MYTHOS_LISTING_ID` | Yes* | — | Your listing ID |
| `MYTHOS_LISTING_IDS` | Yes* | — | Comma-separated listing IDs (overrides above) |
| `MYTHOS_API_URL` | No | `https://api.mythos.work` | API base URL override |

*One of `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` is required.

## API

### `requireLaunchToken()`

Express middleware. Verifies the RS256 launch token from `?lt=`, enforces single-use semantics, and attaches `req.mythos` to the request. Returns `401` if the token is missing, invalid, or already consumed.

### `reportUsage(sessionJti, { credits, reason? })`

Reports credit consumption against a session. Call after delivering value to the user.

### `handshakeRoute()`

Mounts `GET /.well-known/mythos-handshake`. Mythos calls this endpoint during listing publish to confirm the SDK is installed and reachable.

### `verifyLaunchToken(token)`

Low-level token verifier. Returns the decoded payload. Use `requireLaunchToken()` middleware instead for most cases.

## Security

- Tokens verified via RS256 against the Mythos JWKS endpoint
- `alg: none` rejected as a hard block
- Single-use enforcement is non-skippable (ADR-0003)
- JWKS keys cached 10 minutes with automatic re-fetch on key rotation

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
