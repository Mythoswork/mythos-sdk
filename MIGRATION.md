# Migration guide: SDK 0.0.x → 0.1.1

Version 0.1.1 moves launch consumption, encrypted session reuse, metering, handshake and listing registration behind one SDK object. The low-level primitives remain available for integrations that need custom control.

## 0.0.x → 0.1.1 migration matrix

| Area | Node.js before → after | Python before → after |
|---|---|---|
| Verify/session | <code>requireLaunchToken()</code> + app-owned <code>/verify-session</code> → <code>createMythos()</code>, mount <code>mythos.handlers</code> (or <code>pagesHandler(mythos)</code>), then <code>await mythos.getSession(req)</code> | <code>Depends(require_launch_token())</code> + app-owned <code>/verify-session</code> → <code>create_mythos()</code>, <code>app.include_router(mythos.router)</code>, then <code>await mythos.get_session(request)</code> |
| Cookie lifecycle | <code>encodeSession(session)</code> / <code>decodeSession(cookie)</code> in app code → SDK seals the cookie at <code>/api/mythos/session</code> and <code>mythos.getSession(req)</code> returns the public fields | <code>encode_session(session)</code> / <code>decode_session(cookie)</code> in app code → SDK seals the cookie at <code>/mythos/session</code> and <code>mythos.get_session(request)</code> returns a sanitized copy |
| Fixed charge | <code>verifyLaunchToken(lt)</code> + <code>reportUsage(session.sessionJti, { credits, reason })</code> → <code>mythos.charge(req, { credits, reason })</code> | <code>verify_launch_token(lt)</code> + <code>report_usage(session.sessionJti, credits=..., reason=...)</code> → <code>mythos.charge(request, credits=..., reason=...)</code> |
| LLM and billing | <code>llm(session, { apiKey })</code> + <code>getLlmBillingMetadata(completion)</code> → <code>await mythos.llm(req, { apiKey })</code> + <code>mythos.billing(completion)</code> | <code>llm(session, api_key=...)</code> + <code>get_llm_billing_metadata(completion)</code> → <code>await mythos.llm(request, api_key=...)</code> + <code>mythos.billing(completion)</code> |
| Handshake/listing callback | Mount <code>handshakeRoute()</code> and <code>listingCallbackRoute()</code> → SDK handlers; Next Pages Router rewrites <code>/.well-known/mythos-handshake</code> to <code>/api/mythos/handshake</code> and listing registration to <code>/api/mythos/listing-registered</code> | Mount <code>create_handshake_router()</code> and <code>create_listing_callback_handler()</code> → <code>app.include_router(mythos.router)</code>; configure <code>on_listing_registered</code> |
| Startup and errors | Add <code>MYTHOS_SESSION_SECRET</code> (≥32 characters) and Node 20; map <code>MythosError.httpStatus</code>/<code>code</code> | Add <code>MYTHOS_SESSION_SECRET</code> (≥32 characters); map <code>MythosError.http_status</code>/<code>code</code> |

## Requirements and setup

| Requirement | Node.js | Python |
|---|---|---|
| SDK | `@mythos-work/sdk@0.1.1` | `mythos-sdk[fastapi,llm]==0.1.1` |
| Runtime | Node.js 20 or newer | Python 3.11 or newer |
| Required env | `MYTHOS_SESSION_SECRET`, at least 32 characters; `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS`, unless dynamic listing IDs are configured | Same |
| Secret generation | `openssl rand -base64 32` | `openssl rand -base64 32` |

`MYTHOS_API_URL` defaults to `https://api.mythos.work`. Invalid or missing required configuration fails when the SDK object is created, naming the environment variable.

## High-level API

### Node.js

```ts
import { createMythos } from '@mythos-work/sdk';

export const mythos = createMythos();
export const { GET, POST } = mythos.handlers;

const session = await mythos.getSession(request); // null means standalone
await mythos.charge(request, { credits: 1, reason: 'calculator:add' });
const client = await mythos.llm(request, { apiKey: process.env.PRODUCER_OPENAI_API_KEY });
const billing = mythos.billing(completion);
```

For Next.js Pages Router, mount `pagesHandler(mythos)` at a catch-all route and rewrite the two well-known paths:

```ts
// pages/api/mythos/[...mythos].ts
import { pagesHandler } from '@mythos-work/sdk/next';
import { mythos } from '../../../lib/mythos';
export default pagesHandler(mythos);
```

```ts
{ source: '/.well-known/mythos-handshake', destination: '/api/mythos/handshake' }
{ source: '/.well-known/mythos-listing-registered', destination: '/api/mythos/listing-registered' }
```

`createMythos({ resolveListingIds, onListingRegistered })` enables dynamic listing IDs and the registration callback. The built-in session handler consumes the launch token once, reuses the encrypted cookie across page changes, and returns `data: null` for standalone access.

### Python

```python
from mythos_sdk import create_mythos

mythos = create_mythos(resolve_listing_ids=get_listing_ids, on_listing_registered=add_listing_id)
app.include_router(mythos.router)

session = await mythos.get_session(request)  # None means standalone
await mythos.charge(request, credits=1, reason='calculator:add')
client = await mythos.llm(request, api_key=producer_api_key)
billing = mythos.billing(completion)
```

`mythos.router` serves `GET /mythos/session`, the handshake route, and—when configured—the listing-registration callback. The Python session cookie preserves the existing Python encryption byte layout.

## Replace the old primitives

### Verify session and cookie handling

**Before (Node):** mount `requireLaunchToken()` at a verify-session route, call `encodeSession()` and `decodeSession()`, and return a sanitized session to the browser.

**After (Node):** mount `mythos.handlers` or `pagesHandler(mythos)` and call `await mythos.getSession(req)`. Its result contains only `userId`, `email`, `displayName`, `listingId`, and `sessionJti`.

**Before (Python):** mount `require_launch_token`, implement `/verify-session`, then call `encode_session()` / `decode_session()` in app code.

**After (Python):** `app.include_router(mythos.router)` and call `await mythos.get_session(request)`. The returned session has identity-token fields cleared.

### Metering

```ts
// Before
const session = await verifyLaunchToken(lt);
await reportUsage(session.sessionJti, { credits: 1, reason: 'calculator:add' });

// After
await mythos.charge(req, { credits: 1, reason: 'calculator:add' });
```

```python
# Before
session = await verify_launch_token(lt)
await report_usage(session.sessionJti, credits=1, reason='calculator:add')

# After
await mythos.charge(request, credits=1, reason='calculator:add')
```

`charge()` accepts optional `idempotencyKey` / `idempotency_key` and `consentId` / `consent_id`. The typed `MeterResult` returns the `chargeId` and optional `sessionMeteredTotal`. `reportUsage` / `report_usage` remain available and discard that result.

### LLM inference and billing metadata

```ts
// Before
const client = llm(session, { apiKey });
const billing = getLlmBillingMetadata(completion);

// After
const client = await mythos.llm(req, { apiKey, fallback });
const billing = mythos.billing(completion);
```

```python
# Before
client = llm(session, api_key=api_key)
billing = get_llm_billing_metadata(completion)

# After
client = await mythos.llm(request, api_key=api_key, fallback=fallback)
billing = mythos.billing(completion)
```

Standalone requests return the supplied fallback client/value when provided; otherwise the existing LLM errors are raised. OpenAI remains an optional dependency and is loaded only when the SDK's `llm()` helper is used.

### Handshake and listing registration

Remove app-owned `handshakeRoute()` / `create_handshake_router()` and `listingCallbackRoute()` / `create_listing_callback_handler()` mounts when using the high-level handlers/router. Configure `onListingRegistered` / `on_listing_registered` to persist the callback's listing ID. Next.js Pages Router users must retain the well-known-path rewrites shown above.

## Typed errors

| Code | HTTP status | Meaning |
|---|---:|---|
| `CONFIG_ERROR` | 500 | Missing or invalid SDK configuration |
| `INVALID_LAUNCH_TOKEN` | 401 | Invalid launch token |
| `TOKEN_ALREADY_CONSUMED` | 401 | Launch token was already consumed |
| `SESSION_REQUIRED` | 401 | No valid Mythos session on the request |
| `SESSION_EXPIRED` | 401 | Stored session expired or meter returned an expired/not-started session |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `INSUFFICIENT_FUNDS` | 402 | Consumer wallet cannot cover the charge |
| `INVALID_USAGE` | 400 | Invalid meter input |
| `UPSTREAM_ERROR` | 502 | Mythos API returned an unexpected error |
| `MYTHOS_UNREACHABLE` | 503 | SDK could not reach Mythos |

Catch `MythosError` and return its `httpStatus` / `http_status` and `code`; do not collapse these cases into a generic 500.

## Known limitations

- Fixed `charge()` calls can return `SESSION_EXPIRED` roughly five minutes after launch because the backend currently gives `launch_sessions.expires_at` the launch-token expiry. This is tracked by [backend issue #179](https://github.com/Mythoswork/backend/issues/179); LLM requests use a separate 30-minute identity token.
- Node and Python encrypted session cookies are not interchangeable. Their AES-GCM byte layouts remain language-specific until Phase 3.
- Some browsers block third-party cookies. The session endpoint also returns `data.sessionToken`; until the Phase 2 browser helper is available, send it as `X-Mythos-Session` / `x-mythos-session` on SDK calls.
