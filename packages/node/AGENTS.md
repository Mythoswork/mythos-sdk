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
<script src="https://cdn.jsdelivr.net/npm/@mythos-work/sdk@0.3.0/dist/mythos-client.global.js"></script>
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
| `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` | Required unless using `resolveListingIds` / `resolve_listing_ids`. |
| `MYTHOS_API_URL` | Optional; defaults to `https://api.mythos.work`. |
| `MYTHOS_DEBUG=1` | Optional verbose diagnostics. |

## Verify

Run `npx @mythos-work/sdk doctor` (Python: `python -m mythos_sdk doctor`) and fix every ✖ before finishing.

## Error Codes

| Code | HTTP | Meaning |
|---|---:|---|
| `CONFIG_ERROR` | 500 | Missing or invalid configuration |
| `INVALID_LAUNCH_TOKEN` | 401 | Invalid launch token |
| `TOKEN_ALREADY_CONSUMED` | 401 | Launch token reused |
| `SESSION_REQUIRED` | 401 | Billable action has no session |
| `SESSION_EXPIRED` | 401 | Session expired |
| `INSUFFICIENT_FUNDS` | 402 | Wallet balance too low |
| `SESSION_NOT_FOUND` | 404 | Session not found |
| `INVALID_USAGE` | 400 | Invalid credits or usage |
| `UPSTREAM_ERROR` | 502 | Unexpected Mythos response |
| `MYTHOS_UNREACHABLE` | 503 | Mythos cannot be reached |
| `LLM_SESSION_REQUIRED` / `LLM_IDENTITY_REQUIRED` | 500 | LLM session or identity missing |
