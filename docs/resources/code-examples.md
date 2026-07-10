# Code examples

Copy-paste stubs for integrating the Mythos SDK.

{% hint style="info" %}
**Full guides:** [Express](../guides/express.md) · [FastAPI](../guides/fastapi.md) · [Next.js](../guides/nextjs.md)
{% endhint %}

## Server stubs

| File | Stack | Copy to |
|------|-------|---------|
| [express-routes.ts](../examples/express-routes.ts) | Express | `lib/mythosRoutes.ts` or inline in `server.ts` |
| [fastapi-mythos-router.py](../examples/fastapi-mythos-router.py) | FastAPI | `routers/mythos.py` |
| [next-mythos-shim.ts](../examples/next-mythos-shim.ts) | Next.js App Router | `lib/mythos.ts` |

## Frontend clients

| File | Stack | Copy to |
|------|-------|---------|
| [mythos-client.ts](../examples/mythos-client.ts) | TypeScript / React / Next.js | `lib/mythosClient.ts` |
| [mythos-client.js](../examples/mythos-client.js) | Vanilla JS | `static/mythosClient.js` or equivalent |

## Usage

1. Copy the stub for your stack
2. Install the SDK — [Install](../getting-started/install.md)
3. Set `MYTHOS_LISTING_ID` in `.env`
4. Mount routes on **every** production entry point
5. Call `initMythosFromUrl()` on frontend load
6. [Verify](../getting-started/verify-integration.md)

## Next steps

- [Mock integration apps](mock-integration-apps.md)
- [AI integration prompt](../guides/ai-integration-prompt.md)
