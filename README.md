# mythos-sdk

Official SDK packages for integrating with the Mythos platform.

## Packages

| Package | Language | Registry |
|---------|----------|----------|
| [`@mythos/sdk`](./packages/node) | Node.js / TypeScript | npm |
| [`mythos-sdk`](./packages/python) | Python | PyPI |

## Overview

Producers install the Mythos SDK to:

1. **Verify launch tokens** — RS256 JWKS-backed verification of the `?lt=` token Mythos embeds in the redirect URL
2. **Enforce single-use semantics** — the SDK middleware automatically calls `/consume` (per ADR-0003); Producers cannot skip this
3. **Report usage** — `reportUsage()` / `report_usage()` debits the Consumer's Mythos wallet

See [docs/INTEGRATION.md](./docs/INTEGRATION.md) for the full launch → session → metering flow.

## Quick start (Node.js)

```bash
npm install @mythos/sdk express
```

```typescript
import express from 'express';
import { requireLaunchToken, reportUsage, handshakeRoute } from '@mythos/sdk';

const app = express();

// Env vars required:
// MYTHOS_LISTING_ID=<your-listing-id>
// (MYTHOS_API_URL defaults to https://api.mythos.work)

app.get('/.well-known/mythos-handshake', handshakeRoute());

app.get('/dashboard', requireLaunchToken(), async (req, res) => {
  // req.mythos = { userId, email, displayName, listingId, sessionJti }
  await reportUsage(req.mythos.sessionJti, { credits: 1, reason: 'page-view' });
  res.json({ ok: true });
});
```

> **Important:** Use `requireLaunchToken()` for route protection. `verifyLaunchToken()` verifies the JWT only and does **not** call `/consume` — it must not be used alone for auth.

## Quick start (Python / FastAPI)

```bash
pip install "mythos-sdk[fastapi]"
```

```python
from mythos_sdk import require_launch_token, report_usage, handshake_router
from fastapi import FastAPI, Depends

app = FastAPI()
app.include_router(handshake_router)

@app.get("/dashboard")
async def dashboard(session = Depends(require_launch_token)):
    await report_usage(session.sessionJti, credits=1, reason="page-view")
    return {"ok": True}
```

## Configuration

| Env var | Required | Default | Description |
|---------|----------|---------|-------------|
| `MYTHOS_LISTING_ID` | Yes* | — | Your listing ID |
| `MYTHOS_LISTING_IDS` | Yes* | — | Comma-separated listing IDs (overrides above) |
| `MYTHOS_API_URL` | No | `https://api.mythos.work` | API base URL override |

*One of `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` is required for launch token verification and metering. Handshake only needs `MYTHOS_API_URL`.

## API reference

### `requireLaunchToken()` / `require_launch_token`

Express middleware or FastAPI dependency. Reads `?lt=`, verifies JWT, calls `/consume`, attaches session.

| Outcome | Node status | Python status |
|---------|-------------|---------------|
| Missing `lt` | 401 | 401 |
| Invalid/expired token | 401 | 401 |
| Already consumed | 401 | 401 |
| Missing config | 500 | 500 |
| Consume unreachable | 503 | 503 |

### `reportUsage(jti, opts)` / `report_usage(jti, credits, ...)`

Posts to `/meter`. `credits` must be a positive integer.

| Option | Node | Python |
|--------|------|--------|
| Reason | `reason?: string` | `reason: str \| None` |
| Idempotency | `idempotencyKey?: string` | `idempotency_key: str \| None` |

Pass the same idempotency key when retrying a failed meter call to avoid double-charging.

### Errors

| Error | Code | When |
|-------|------|------|
| `MythosConfigError` | `CONFIG_ERROR` | Missing listing ID env |
| `InvalidLaunchTokenError` | `INVALID_LAUNCH_TOKEN` | Bad JWT claims |
| `InsufficientFundsError` | `INSUFFICIENT_FUNDS` | Meter returns 402 |
| `SessionNotFoundError` | `SESSION_NOT_FOUND` | Meter returns 404 |
| `InvalidUsageError` | `INVALID_USAGE` | Invalid credits value |

## Security

- Tokens are verified using RS256 signatures from the Mythos JWKS endpoint
- `alg: none` is rejected as a hard block — not just a warning
- Single-use enforcement is non-skippable and non-configurable (ADR-0003) — use `requireLaunchToken()`, not `verifyLaunchToken()` alone
- JWKS public keys are cached for 10 minutes per API URL with automatic re-fetch on key rotation
- All Mythos HTTP calls use a 5 second timeout
- Strip `?lt=` from the URL after successful auth to avoid leaking tokens via Referer headers

## Development

```bash
# Node
cd packages/node && npm ci && npm test

# Python
cd packages/python && pip install -e ".[dev]" && pytest
```

See [packages/node/README.md](./packages/node/README.md) and [packages/python/README.md](./packages/python/README.md).

## License

Copyright (c) Mythos. All rights reserved.

Proprietary software — see [LICENSE](./LICENSE).
