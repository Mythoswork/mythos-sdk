# Integrate Mythos

Mythos lets users buy credits once and spend them across apps. The SDK handles launch tokens, sessions, billing, and browser transport for Producer apps.

## Rules

- Use `createMythos()` in Node or `create_mythos()` in Python.
- Never parse `lt`, set Mythos cookies, or call `/consume` or `/meter` directly.
- Never store Mythos tokens yourself. Do not use `localStorage` or `sessionStorage`; the SDK owns transport.
- Always call browser `confirmCharge` before a billable action, then call server `charge` after approval.
- LLM calls are usage-based: `confirmCharge({ kind: 'llm', reason })` takes no credits; billing settles after the response.
- Express/FastAPI do not load `.env` automatically; Next.js does. Make sure the process actually loads the env file.
- Map `MythosError` with `.httpStatus`; Python uses `.http_status`.
- Sessions last up to 8 h and refresh automatically; never cache `llm()` clients across requests.
- Test launches report diagnostics; real sessions never do. Reports contain only `code`, `step`, and `sdk_version`; they are best-effort background calls with a two-second timeout.

## Pick Your Framework

### Next.js App Router

```ts
// lib/mythos.ts
import { createMythos } from '@mythos-work/sdk';
export const mythos = createMythos();
```

```ts
// app/api/mythos/[...mythos]/route.ts
import { mythos } from '../../../../lib/mythos';
export const { GET, POST } = mythos.handlers;
```

Add both well-known rewrites shown under Next.js Pages Router.

### Next.js Pages Router

Create `lib/mythos.ts` as above, then:

```ts
// pages/api/mythos/[...mythos].ts
import { pagesHandler } from '@mythos-work/sdk/next';
import { mythos } from '../../../lib/mythos';
export default pagesHandler(mythos);
```

```js
// next.config.js
async rewrites() { return [
  { source: '/.well-known/mythos-handshake', destination: '/api/mythos/handshake' },
  { source: '/.well-known/mythos-listing-registered', destination: '/api/mythos/listing-registered' },
]; }
```

### Express

```ts
// server.ts
import express from 'express';
import { createMythos } from '@mythos-work/sdk';
import { mythosExpress } from '@mythos-work/sdk/express';
const app = express();
const mythos = createMythos();
app.use(express.json());
app.use(mythosExpress(mythos));
```

Run with `node --env-file=.env server.js` (Node ≥ 20.6), or set the variables in the host environment.

### FastAPI

```python
# main.py
from fastapi import FastAPI
from mythos_sdk import create_mythos

app = FastAPI()
mythos = create_mythos()
app.include_router(mythos.router)
```

Run with `uvicorn main:app --env-file .env` (needs `fastapi[standard]`), or set the variables in the host environment.

## URLs Mythos Calls

The Producer enters two URLs on the Listing. Once the SDK is mounted as shown above, it serves every route below. Do not write these handlers yourself.

| Listing field | Enter | Mythos calls | Served by |
|---|---|---|---|
| Launch URL | The page users open, e.g. `https://app.example.com` | Loads it in an iframe with `?lt=<launch token>`; the page's browser client then calls `/api/mythos/session` | `useMythos()` / `initMythos()` + `mythos.handlers` / `mythos.router` |
| (derived from Launch URL) | Nothing | `GET <Launch URL>/.well-known/mythos-handshake?lt=…` before publish | Next.js rewrite → `/api/mythos/handshake`; `mythosExpress`; `mythos.router` |
| Callback URL (optional) | The **full** endpoint URL, e.g. `https://app.example.com/.well-known/mythos-listing-registered` | `POST <Callback URL>?lt=…` when the Listing is created. The URL is used exactly as entered; no path is appended | `createMythos({ onListingRegistered })` / `create_mythos(on_listing_registered=…)` |

- The handshake path is appended to the full Launch URL. A Launch URL with a path (`https://app.example.com/calc`) is checked at `https://app.example.com/calc/.well-known/mythos-handshake`.
- The callback must return HTTP 200. The SDK does that after `onListingRegistered(listingId)` resolves. Make the callback idempotent (upsert, not append).
- The callback only matters with `resolveListingIds` / `resolve_listing_ids`: store the ID in `onListingRegistered` and return the stored IDs from the resolver. With a static `MYTHOS_LISTING_ID`, leave Callback URL empty.
- On serverless hosts (Vercel), the callback and session routes may run in different instances. Store Listing IDs in shared storage (Redis/DB), not memory or `/tmp`.
- Callback URL must be HTTPS in production.

## Reference Implementations

These complete working apps run on the current SDK. Read them for real wiring, especially the callback:

| Stack | Repository | Look at |
|---|---|---|
| Next.js (Pages Router) | https://github.com/Mythoswork/mythos-sdk-node-js-mock-integration-app | `lib/mythos.ts` (`onListingRegistered` + `resolveListingIds`), `lib/listing-ids-store.ts` (Redis with file fallback), `pages/api/mythos/[...mythos].ts`, `next.config.ts` rewrites, `pages/calculator.tsx` (`useMythos`), `pages/api/calculate.ts` (`mythos.charge`), `pages/api/chat.ts` (`mythos.llm`) |
| FastAPI | https://github.com/Mythoswork/mythos-sdk-python-mock-integration-app | `main.py` (`create_mythos(on_listing_registered=…)`, `app.include_router(mythos.router)`, `mythos.charge`, `mythos.llm`), `listing_ids_store.py` |

Copy patterns, not whole apps. The mocks also include test-harness routes (`harness/*`) that real apps do not need.

## Browser

React apps use the shared client without a Provider:

```tsx
import { useMythos } from '@mythos-work/sdk/react';
const { status, session, error, fetch, confirmCharge, relaunch } = useMythos();
```

Handle every state before rendering billable UI:

```tsx
if (status === 'loading') return <p>Loading...</p>;
if (status === 'standalone') return <OwnLogin />;
if (status === 'expired') return <button onClick={relaunch}>Relaunch</button>;
if (status === 'error') return <p>{error?.message}</p>;
const { approved, consentId } = await confirmCharge({ credits: 1, reason: 'calculate' });
if (approved) await fetch('/api/calculate', { method: 'POST' });
// LLM chat: usage-based, no credits
const { approved: chatApproved } = await confirmCharge({ kind: 'llm', reason: 'chat' });
```

Non-React bundled apps import `initMythos` from `@mythos-work/sdk/client`. Unbundled pages use:

```html
<script src="https://cdn.jsdelivr.net/npm/@mythos-work/sdk@0.5.1/dist/mythos-client.global.js"></script>
<script>const m = Mythos.initMythos(); m.ready.then(console.log);</script>
```

## Server Billing

```ts
import OpenAI from 'openai';
await mythos.charge(req, { credits: 1, reason: 'calculate' });
const fallback = new OpenAI({ apiKey: process.env.PRODUCER_OPENAI_API_KEY });
const client = await mythos.llm(req, { apiKey: process.env.PRODUCER_OPENAI_API_KEY, fallback });
const billing = mythos.billing(completion);
```

Python uses `await mythos.charge(request, credits=1, reason="calculate")`, `await mythos.llm(request, api_key=producer_api_key)`, and `mythos.billing(completion)`.

## Environment

| Variable | Requirement |
|---|---|
| `MYTHOS_SESSION_SECRET` | Required, at least 32 characters. Generate with `openssl rand -base64 32`. |
| `MYTHOS_KEY` | Copy from Dashboard → Settings → Mythos key. Missing is a soft warning for auto-registration in 0.5.0; required in 0.6.0. |
| `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` | Required unless using `resolveListingIds` / `resolve_listing_ids`. |
| `MYTHOS_API_URL` | Optional; defaults to `https://api.mythos.work`. |
| `MYTHOS_DEBUG=1` | Optional verbose diagnostics. |

```dotenv
# openssl rand -base64 32  (>= 32 chars)
MYTHOS_SESSION_SECRET=
# Mythos dashboard → Settings → Mythos key
MYTHOS_KEY=
```

### Producer binding (Node and Python)

`MYTHOS_KEY` is a Mythos-generated, non-secret identifier (`mk_` + 32 base64url characters). Keep it in server deployment configuration. Regenerating it requires updating the environment and redeploying. Startup rejects a malformed key with `MythosConfigError('MYTHOS_KEY is malformed. Copy it again from the Mythos dashboard.')`.

Launch, handshake (`handshake-check`) and callback (`listing_registered`) tokens use the same `pkh`: base64url without padding of SHA-256 of UTF-8 bytes of the **full key string**, including `mk_`. The backend omits `pkh` when the owner has no key. Literal hash fixture (not a valid deployment key): `mk_test` → `7i08_9pmD6r4prkeKSsCnOFaCAduf8cz4ogjmhGlpG0`.

| Key | Token `pkh` | Result |
|---|---|---|
| Set | Matches hash(key) | Accept |
| Set | Different or missing | Reject with `ProducerMismatchError` / `PRODUCER_MISMATCH`, HTTP 401 |
| Unset | Anything | Accept; warn once per process for launches outside static `MYTHOS_LISTING_ID(S)`, handshake or callback validation |

Static listing launches without a key are safe legacy configuration and remain silent in 0.5.0. Configuring a resolver or registration callback without a key warns at startup (counts as the once). `MYTHOS_KEY` will be required in 0.6.0.

Exact warning, with `[mythos]` prefix:

> MYTHOS_KEY is not set: this app accepts Listings auto-registered by any Mythos Producer. Copy your key from the Mythos dashboard into MYTHOS_KEY. It will be required in 0.6.0.

Session mismatch response: HTTP 401 `{"success":false,"error":"This app is bound to a different Mythos Producer. Check MYTHOS_KEY.","code":"PRODUCER_MISMATCH"}`. Handshake and callback: HTTP 401 `{"error":"Producer mismatch"}`; never invoke the registration callback on mismatch. Legacy middleware keeps its existing invalid-token 401 because `ProducerMismatchError` extends `InvalidLaunchTokenError`.

Mismatch logs contain `<handshake|listing-callback|session>: producer mismatch` and `{ listingId }` only. Never log the key, `pkh`, or token.

## Verify

Run `npx @mythos-work/sdk doctor` (Python: `python -m mythos_sdk doctor`) and fix every ✖ before finishing.

## Error Codes

| Code | HTTP | Meaning |
|---|---:|---|
| `CONFIG_ERROR` | 500 | Missing or invalid configuration |
| `INVALID_LAUNCH_TOKEN` | 401 | Invalid launch token |
| `LISTING_NOT_REGISTERED` | 401 | Launch audience is not registered with this app |
| `PRODUCER_MISMATCH` | 401 | The `MYTHOS_KEY` in this deployment belongs to a different Producer, or was regenerated. Copy the current key from the dashboard and redeploy. |
| `TOKEN_ALREADY_CONSUMED` | 401 | Launch token reused |
| `SESSION_REQUIRED` | 401 | Billable action has no session |
| `SESSION_EXPIRED` | 401 | Session expired |
| `INSUFFICIENT_FUNDS` | 402 | Wallet balance too low |
| `SESSION_NOT_FOUND` | 404 | Session not found |
| `INVALID_USAGE` | 400 | Invalid credits or usage |
| `UPSTREAM_ERROR` | 502 | Unexpected Mythos response |
| `MYTHOS_UNREACHABLE` | 503 | Mythos cannot be reached |
| `LLM_SESSION_REQUIRED` / `LLM_IDENTITY_REQUIRED` | 500 | LLM session or identity missing |
