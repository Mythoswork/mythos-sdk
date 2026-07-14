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
4. **Publish handshake** — `handshakeRoute()` / `handshake_router` for the Mythos publish gate
5. **Listing callback** — `listingCallbackRoute()` / `create_listing_callback_handler` for dynamic listing ID registration

## Documentation

Full Producer documentation lives in [`docs/`](./docs/) (GitBook-ready):

- **Docs home:** [docs/README.md](./docs/README.md)
- **Quickstart (Node):** [docs/getting-started/quickstart-node.md](./docs/getting-started/quickstart-node.md)
- **Quickstart (Python):** [docs/getting-started/quickstart-python.md](./docs/getting-started/quickstart-python.md)
- **AI integration prompt:** [docs/guides/ai-integration-prompt.md](./docs/guides/ai-integration-prompt.md)
- **Code examples:** [docs/examples/](./docs/examples/)
- **Cursor skill:** copy [`.cursor/skills/integrate-mythos-sdk/`](./.cursor/skills/integrate-mythos-sdk/) into your project

## Quick start (Node.js)

```bash
npm install @mythos/sdk
```

```typescript
import { requireLaunchToken, reportUsage, handshakeRoute } from '@mythos/sdk';

// Env vars required:
// MYTHOS_LISTING_ID=<your-listing-id>
// (MYTHOS_API_URL defaults to https://api.mythos.work)

app.use('/.well-known/mythos-handshake', handshakeRoute());

app.get('/dashboard', requireLaunchToken(), async (req, res) => {
  // req.mythos = { userId, email, displayName, listingId, sessionJti }
  await reportUsage(req.mythos.sessionJti, { credits: 1, reason: 'page-view' });
  res.json({ ok: true });
});
```

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
async def dashboard(session=Depends(require_launch_token)):
    await report_usage(session.sessionJti, credits=1, reason="page-view")
    return {"ok": True}
```

## Configuration

| Env var | Required | Default | Description |
|---------|----------|---------|-------------|
| `MYTHOS_LISTING_ID` | Yes* | — | Your listing ID |
| `MYTHOS_LISTING_IDS` | Yes* | — | Comma-separated listing IDs (overrides above) |
| `MYTHOS_API_URL` | No | `https://api.mythos.work` | API base URL override |

\*One of `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` is required — unless using [dynamic listing IDs](./docs/concepts/dynamic-listing-ids.md).

## Security

- Tokens are verified using RS256 signatures from the Mythos JWKS endpoint
- `alg: none` is rejected as a hard block — not just a warning
- Single-use enforcement is non-skippable and non-configurable (ADR-0003)
- JWKS public keys are cached for 10 minutes with automatic re-fetch on key rotation

## Development

See [packages/node/](./packages/node) and [packages/python/](./packages/python) for package-specific development guides.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
