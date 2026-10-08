# Mythos SDK — Producer Integration Guide

This guide has moved to the Docusaurus documentation site.

**Start here:** [docs/README.md](./README.md)

## Deployment environment (0.5.0)

```dotenv
MYTHOS_SESSION_SECRET=   # openssl rand -base64 32  (>= 32 chars)
MYTHOS_KEY=              # Mythos dashboard → Settings → Mythos key
```

Producer binding prevents another Producer from registering their Listing against your app. Set the key in the host environment; update it and redeploy after regeneration. Missing keys are soft in 0.5.0; static `MYTHOS_LISTING_ID(S)` launches remain silent, while dynamic launches, handshake and callback validation warn once per process. A resolver or callback warns at startup. The key will be required in 0.6.0. See the [binding matrix and exact warning](../docs-site/docs/reference/configuration.md).

| Troubleshooting code | Fix |
|---|---|
| `PRODUCER_MISMATCH` | The `MYTHOS_KEY` in this deployment belongs to a different Producer, or was regenerated. Copy the current key from the dashboard and redeploy. |

| Old section | New location |
|-------------|--------------|
| How Mythos launch works | [concepts/launch-sessions.md](../docs-site/docs/concepts/launch-sessions.md) |
| SDK surface | [reference/node/overview.md](../docs-site/docs/reference/node/overview.md) · [reference/python/overview.md](../docs-site/docs/reference/python/overview.md) |
| Required routes | [guides/required-routes.md](../docs-site/docs/guides/required-routes.md) |
| Stack recipes | [Express](../docs-site/docs/getting-started/quickstart-express.md) · [FastAPI](../docs-site/docs/getting-started/quickstart-fastapi.md) · [Next.js](../docs-site/docs/getting-started/quickstart-nextjs-app.md) |
| Frontend client | [getting-started/browser-client.md](../docs-site/docs/getting-started/browser-client.md) |
| Verification checklist | [getting-started/verify-integration.md](../docs-site/docs/getting-started/verify-integration.md) |
| Common gotchas | [resources/troubleshooting.md](../docs-site/docs/resources/troubleshooting.md) |
