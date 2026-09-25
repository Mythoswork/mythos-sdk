# @mythos-work/sdk

Official Mythos SDK for Node.js — launch token verification, OpenAI-compatible LLM access, usage reporting, and handshake.

## Quick start (0.2.0)

```typescript
import { createMythos } from '@mythos-work/sdk';

export const mythos = createMythos();
export const { GET, POST } = mythos.handlers;

const session = await mythos.getSession(req); // null in standalone mode
await mythos.charge(req, { credits: 1, reason: 'page-view' });
const client = await mythos.llm(req, { apiKey: process.env.PRODUCER_OPENAI_API_KEY });
const billing = mythos.billing(completion);
```

Set `MYTHOS_SESSION_SECRET` to a random secret of at least 32 characters (`openssl rand -base64 32`). Node.js 20+ is required. See the [migration guide](../../MIGRATION.md) for Next.js Pages Router wiring and error handling.

### Browser

```tsx
import { useMythos } from '@mythos-work/sdk/react';
const { status, session, fetch, confirmCharge, relaunch } = useMythos();
```

For non-bundled pages:

```html
<script src="https://cdn.jsdelivr.net/npm/@mythos-work/sdk@0.2.0/dist/mythos-client.global.js"></script>
<script>const mythos = Mythos.initMythos(); mythos.ready.then(console.log);</script>
```

## Advanced (primitives)

Legacy `sendHandshake` and boolean-returning `confirmCharge` remain available from `@mythos-work/sdk/client`.

## Install

```bash
npm install @mythos-work/sdk@0.2.0
```

## OpenAI-compatible LLM

Use the session returned by `requireLaunchToken()` to create an official OpenAI client that
routes through Mythos. The provider key is sent as the normal OpenAI `Authorization` header;
the SDK adds the session identity header internally.

```typescript
import { getLlmBillingMetadata, llm } from '@mythos-work/sdk/llm';

const client = llm(req.mythos, { apiKey: process.env.PROVIDER_API_KEY });
const completion = await client.chat.completions.create({
  model: 'openai/gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
});
const billing = getLlmBillingMetadata(completion);
```

If no session is available, pass `{ fallback }` to return a fallback value unchanged; otherwise
`llm()` throws `MythosError`. `baseURL` overrides the default `${MYTHOS_API_URL}/v1`, and
`timeout` is in milliseconds.

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

Express middleware. Verifies the ES256 launch token from `?lt=`, enforces single-use semantics, and attaches `req.mythos` to the request. Listing IDs are read from `MYTHOS_LISTING_ID(S)` by default; pass `resolveListingIds` to supply them dynamically (e.g. from storage populated by `listingCallbackRoute`). Returns `401` if the token is missing, invalid, or already consumed.

### `reportUsage(sessionJti, { credits, reason? })`

Reports non-inference product fees against a session. Call after delivering value to the user;
LLM inference is metered by the OpenAI-compatible gateway instead.

### `llm(session, { apiKey?, fallback?, baseURL?, timeout? })`

Returns an official OpenAI client configured for the Mythos gateway and the session's identity.
Use `getLlmBillingMetadata(completion)` to read server-provided billing metadata.

### `handshakeRoute()`

Returns an Express `Router` that mounts `GET /.well-known/mythos-handshake`. Use `app.use(handshakeRoute())` so the backend can reach the designated address during listing publish.

### `listingCallbackRoute(onRegistered)`

Returns an Express `RequestHandler`. Mount it at the listing callback URL you configure. It validates the `?lt=` token, calls `onRegistered(listingId)` on success, and responds with `{ ok: true }`. Use the callback to persist the listing ID so `resolveListingIds` can read it. Returns `401` for missing/invalid tokens and `503` for unexpected errors.

### `verifyLaunchToken(token, { resolveListingIds? })`

Low-level token verifier. Validates the launch token and returns the decoded `MythosSession`. Listing IDs are read from `MYTHOS_LISTING_ID(S)` by default; pass `resolveListingIds` to supply them dynamically. Use `requireLaunchToken()` middleware instead for most cases.

## Security

- Tokens verified via ES256 against the Mythos JWKS endpoint
- `alg: none` rejected as a hard block
- Single-use enforcement is non-skippable (ADR-0003)
- JWKS keys cached 10 minutes with automatic re-fetch on key rotation

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
