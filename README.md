# mythos-sdk

Official SDK packages for integrating with the Mythos platform.

## Packages

| Package | Language | Registry |
|---------|----------|----------|
| [`@mythos-work/sdk`](./packages/node) | Node.js / TypeScript | npm |
| [`mythos-sdk`](./packages/python) | Python | PyPI |

## Overview

Producers install the Mythos SDK to:

1. **Verify launch tokens** — ES256 JWKS-backed verification of the `?lt=` token Mythos embeds in the redirect URL
2. **Own sessions** — `createMythos()` / `create_mythos()` consumes launch tokens once and manages sealed sessions
3. **Bill usage** — browser `confirmCharge` before a billable action, server `charge` after approval; LLM billing is usage-based
4. **Publish handshake and listing callback** — SDK handlers verify Producer binding before accepting dynamic registration

## Documentation

Full Producer documentation lives in [`docs-site/`](./docs-site/) (Docusaurus):

- **Docs home:** [docs/README.md](./docs/README.md)
- **Quickstart (Node):** [Express](./docs-site/docs/getting-started/quickstart-express.md) · [Next.js](./docs-site/docs/getting-started/quickstart-nextjs-app.md)
- **Quickstart (Python):** [FastAPI](./docs-site/docs/getting-started/quickstart-fastapi.md)
- **AI integration instructions:** [AGENTS.md](./AGENTS.md)
- **Code examples:** [docs/examples/](./docs/examples/)
- **Cursor skill:** copy [`.cursor/skills/integrate-mythos-sdk/`](./.cursor/skills/integrate-mythos-sdk/) into your project

See [docs/INTEGRATION.md](./docs/INTEGRATION.md) for the full launch → session → metering flow.

## Quick start (Node.js)

```bash
npm install @mythos-work/sdk
```

```typescript
import express from 'express';
import { createMythos } from '@mythos-work/sdk';
import { mythosExpress } from '@mythos-work/sdk/express';

const app = express();

const mythos = createMythos();
app.use(express.json());
app.use(mythosExpress(mythos));
// Billable handlers: await mythos.charge(req, { credits: 1, reason: 'calculate' });
// Browser must approve via confirmCharge first.
```

Express does not load `.env` automatically: use `node --env-file=.env server.js` (Node ≥20.6) or host environment variables. Use the SDK browser client; the SDK owns launch-token transport and sessions.

## Quick start (Python / FastAPI)

```bash
pip install "mythos-sdk[fastapi]"
```

```python
from mythos_sdk import create_mythos
from fastapi import FastAPI

app = FastAPI()
mythos = create_mythos()
app.include_router(mythos.router)
# Billable handlers: await mythos.charge(request, credits=1, reason="calculate")
# Browser must approve via confirmCharge first.
```

## Configuration

```dotenv
# openssl rand -base64 32  (>= 32 chars)
MYTHOS_SESSION_SECRET=
# Mythos dashboard → Settings → Mythos key
MYTHOS_KEY=
# your static Listing ID, unless using a resolver
MYTHOS_LISTING_ID=
```

FastAPI also needs an explicit env loader, such as `uvicorn main:app --env-file .env` with `fastapi[standard]` installed.

| Env var              | Required | Default                   | Description                                   |
| ----------------------| ----------| ---------------------------| -----------------------------------------------|
| `MYTHOS_SESSION_SECRET` | Yes | — | At least 32 characters; server-side session secret |
| `MYTHOS_KEY` | Soft in 0.5.0 | — | Dashboard Producer key; required in 0.6.0 |
| `MYTHOS_LISTING_ID`  | Yes*     | —                         | Your listing ID                               |
| `MYTHOS_LISTING_IDS` | Yes*     | —                         | Comma-separated listing IDs (overrides above) |
| `MYTHOS_API_URL`     | No       | `https://api.mythos.work` | API base URL override                         |

\*One of `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` is required — unless using [dynamic listing IDs](./docs-site/docs/concepts/dynamic-listing-ids.md).

When a key is set, matching `pkh` is accepted; a different or missing `pkh` is rejected with `ProducerMismatchError` / `PRODUCER_MISMATCH` (401). Without a key, static listing launches are safe legacy configuration and silent; dynamic launches, handshake and callback validation warn once per process. A resolver or callback without a key warns at startup. See [0.5.0 migration](./MIGRATION.md#04x--050) for the exact matrix, warning, hash vector and response bodies. Regenerating the key requires updating deployment env and redeploying.

| Troubleshooting code | Fix |
|---|---|
| `PRODUCER_MISMATCH` | The `MYTHOS_KEY` in this deployment belongs to a different Producer, or was regenerated. Copy the current key from the dashboard and redeploy. |

## Security

- Tokens are verified using ES256 signatures from the Mythos JWKS endpoint
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

Apache-2.0 — see [LICENSE](./LICENSE).
