# Code examples

Copy-paste stubs for integrating the Mythos SDK.

:::info
**Full guides:** [Express](../guides/express.md) · [FastAPI](../guides/fastapi.md) · [Next.js](../guides/nextjs.md)
:::

## Server stubs

| Guide | Stack | Copy to |
|-------|-------|---------|
| [Express](../guides/express.md) | Express | `lib/mythosRoutes.ts` or inline in `server.ts` |
| [FastAPI](../guides/fastapi.md) | FastAPI | `routers/mythos.py` |
| [Next.js](../guides/nextjs.md) | Next.js App Router | `lib/mythos.ts` |

## Frontend clients

| Guide | Stack | Copy to |
|-------|-------|---------|
| [Frontend client](../guides/frontend-client.md) | TypeScript / React / Next.js / vanilla JS | `lib/mythosClient.ts` or `static/mythosClient.js` |

## Usage

1. Open the guide for your stack and copy the inline stubs
2. Install the SDK — [Install](../getting-started/install.md)
3. Set `MYTHOS_LISTING_ID` in `.env`
4. Mount routes on **every** production entry point
5. Call `initMythosFromUrl()` on frontend load
6. [Verify](../getting-started/verify-integration.md)

## Next steps

- [Mock integration apps](mock-integration-apps.md)
- [AI integration prompt](../guides/ai-integration-prompt.md)
