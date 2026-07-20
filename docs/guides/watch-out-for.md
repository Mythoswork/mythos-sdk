# What to watch out for

Every item here comes from the SDK's source, its test suite, or a real commit in one of the reference mock apps. Where a bug was hit and fixed in production, the commit is linked so you can see the actual failure.

> **ℹ️ Info**
> This page assumes you've already done the [Node](../getting-started/quickstart-node.md) or [Python](../getting-started/quickstart-python.md) quickstart. Come back here before you ship.

## Launch tokens are single-use

`requireLaunchToken()` / `require_launch_token()` calls the backend's `/consume` endpoint exactly once per token. That call, not JWT expiry alone, is what makes the token single-use. Call it a second time on the same `lt` and you get:

```json
401 { "error": "Token already consumed" }
```

(`packages/node/src/middleware.ts`, `packages/python/mythos_sdk/middleware.py`)

**Metering a billable action does not need a second consume.** Use the non-consuming `verifyLaunchToken()` / `verify_launch_token()` instead — it re-validates the JWT without touching `/consume`:

```typescript
const session = await verifyLaunchToken(lt); // does NOT consume
await reportUsage(session.sessionJti, { credits: 1, reason: 'export' });
```

See [Launch sessions](../concepts/launch-sessions.md) for the full lifecycle.

## FastAPI: the listing-callback route needs `methods=["GET", "POST"]` explicitly

`create_listing_callback_handler()` returns a bare, method-agnostic handler. Mythos calls it with `POST` (query-string `lt`, no body). FastAPI doesn't infer allowed methods from a plain callable — if you register it the way `include_router` or a single-method decorator would suggest, `POST` 405s.

This is a real bug the Python mock app shipped and then fixed — [commit `c791b53`](https://github.com/Mythoswork/mythos-sdk-python-mock-integration-app/commit/c791b53):

```diff
 app = FastAPI()
 app.include_router(create_handshake_router())
-app.include_router(create_listing_callback_router(add_listing_id))
+app.add_api_route(
+    "/.well-known/mythos-listing-registered",
+    create_listing_callback_router(add_listing_id),
+    methods=["GET", "POST"],
+)
```

Always register with `add_api_route(..., methods=["GET", "POST"])`. Node's Express version doesn't have this footgun — `app.use(path, handler)` matches all methods by default.

## Verifying purpose-scoped JWTs

Mythos issues three different JWT "kinds" from the same key set, distinguished by a `purpose` claim: launch tokens (implicit/no purpose check), handshake-check tokens (`purpose: "handshake-check"`), and listing-registered tokens (`purpose: "listing_registered"`). A signature-valid token of the *wrong* purpose must still be rejected.

This matters more than it looks like it should, because **issuer checking is asymmetric across token types** — a genuine surprise once you read the source closely:

- Launch tokens and listing-registered tokens check `iss == "mythos"` (`packages/node/src/verify.ts`, `packages/node/src/listing-callback.ts`, `packages/python/mythos_sdk/verify.py`, `packages/python/mythos_sdk/listing_callback.py`)
- Handshake-check tokens check **no issuer at all** — `packages/node/src/handshake.ts` passes no `issuer` option to `jwtVerify`, and `packages/python/mythos_sdk/handshake.py` sets `_DECODE_OPTIONS = {"verify_aud": False, "verify_iss": False}` with the code comment *"Tokens in this SDK carry no aud/iss claims."*

That means `purpose` is the **only** thing stopping a listing-registered token from being replayed at your handshake endpoint. If you write your own handshake logic instead of using `handshakeRoute()`/`handshake_router` verbatim, don't skip the purpose check just because the signature already validated.

## Dynamic listing IDs — don't hardcode `MYTHOS_LISTING_ID`

If you register listings dynamically (via the [listing-registered callback](../concepts/dynamic-listing-ids.md)) rather than a fixed env var, a listing created *after your process started* won't be in a static `MYTHOS_LISTING_ID` — you must pass `resolveListingIds` to actually pick it up.

Two real bugs shipped from getting this wrong:

- **Node SDK regression** — `requireLaunchToken()` didn't forward `resolveListingIds` to `verifyLaunchToken()` even though the latter already supported it, so dynamic-listing verification silently 401'd on the very first call. Fixed in commit `ce0de8f`; the regression test spells it out: *"Regression for the live 401 bug: requireLaunchToken() must forward its options through to verifyLaunchToken, not just calculate.ts's direct call"* (`packages/node/tests/middleware.test.ts`).
- **Node mock app on Vercel** — dynamic listing IDs were persisted to a JSON file under `process.cwd()`. Vercel's filesystem is read-only at that path. Fixed in [commit `a04c69b`](https://github.com/Mythoswork/mythos-sdk-node-js-mock-integration-app/commit/a04c69b) by moving storage to `os.tmpdir()`. If you're rolling your own `resolveListingIds` backed by disk on a serverless platform, this will bite you the same way.

## Credits must be integers

Neither SDK validates this for you today. `reportUsage(jti, { credits: number })` / `report_usage(jti, credits: int)` are just type hints — pass `1.5` and it goes straight through to the backend's `/meter` endpoint as-is (`packages/node/src/api-client.ts`, `packages/python/mythos_sdk/api_client.py` — no `Number.isInteger` / `isinstance` check anywhere in either call path). The backend rejects floats on monetary fields, so you'll get a runtime failure from the API, not a type error from the SDK. Round or validate before calling `reportUsage`.

## Config errors and network failures both look like "Invalid launch token"

`requireLaunchToken()` / `require_launch_token()` currently wrap *any* failure from `verifyLaunchToken()` — a missing `MYTHOS_LISTING_ID` env var, a JWKS fetch timeout, or an actually-bad token — into the same generic response:

```json
401 { "error": "Invalid launch token" }
```

(`packages/node/src/middleware.ts`, `packages/python/mythos_sdk/middleware.py` — both use a bare `catch`/`except Exception` around the verify call)

If your app suddenly 401s on every request right after a deploy, check your env vars *before* assuming the token/JWKS setup is broken — a forgotten `MYTHOS_LISTING_ID` looks identical to a replayed or forged token from the outside.

## Not every SDK error is catchable the same way

Only `InsufficientFundsError` and `SessionNotFoundError` are typed subclasses you can reliably `instanceof`-check today. `verifyLaunchToken()` throws a plain `Error` for "no listing configured" and "audience mismatch" (`verify.ts`), and `meter_session()`/`meterSession()` only wraps HTTP `402`/`404` into typed errors — any other failure (`500`, `503`, connection errors) surfaces as a raw `httpx.HTTPStatusError` (Python) or generic `Error` (Node), not a `MythosError`. A broad `catch (e) { if (e instanceof MythosError) ... }` around your integration will silently miss these — add a fallback branch.

## `postMessage` after launch — required, not enforced, fails silently

After your launch-token verification succeeds client-side, Mythos's frontend is waiting for your iframe to `postMessage` back before it'll show your app. Nothing in the SDK types or a compiler checks this. Skip it and the Mythos FE just times out after ~5s with a generic "app did not respond" — even though your auth worked perfectly.

```typescript
// right after verify-session succeeds, client-side:
window.parent.postMessage({ type: 'mythos:handshake' }, '*'); // scope the origin in production
```

This was hit and documented in the node mock app's own [commit `8255b17`](https://github.com/Mythoswork/mythos-sdk-node-js-mock-integration-app/commit/8255b17): *"This step is not optional and is not obvious from the SDK types... it only shows up as a silent FE-side timeout."*

## `MYTHOS_LISTING_IDS` silently overrides `MYTHOS_LISTING_ID` — even with garbage in it

If `MYTHOS_LISTING_IDS` is set **at all**, `MYTHOS_LISTING_ID` is never consulted as a fallback — not merged, not compared, just ignored (`packages/node/src/config.ts`, `packages/python/mythos_sdk/config.py`). A stray leftover `MYTHOS_LISTING_IDS=" , "` from an old deploy config silently breaks an otherwise-correct single-listing setup, and the resulting error ("no listing IDs configured") won't point you at the actual cause. Check both env vars, not just the one you meant to set.

## Importing the SDK in a client bundle fails only at runtime

The Node package's `"browser"` export condition swaps in a stub where every function throws `MythosError` (`code: 'NOT_IMPLEMENTED'`) the moment it's called — there's no build-time signal. If a bundler (Next.js, Vite) accidentally pulls an SDK import into client-side code, you won't find out until that code path actually runs in a browser. Keep all SDK calls server-side; see the [Next.js guide](nextjs.md) and [Vercel serverless guide](vercel-serverless.md) for the split.

## Also worth knowing

- The handshake endpoint's `sdk_version` field is currently a hardcoded string in both SDKs, not read from the installed package version — don't use it to diagnose which SDK build a producer is actually running.
- The JWKS keyset is cached per-process for 10 minutes and isn't keyed by `MYTHOS_API_URL` — if a single long-running process ever switches API URLs (e.g. an environment cutover without a restart), it can keep validating against the previous environment's keys until the cache naturally expires.

## Local dev: auto-reloaders watching dependency directories look like a flaky handshake

If you're running the reference mock apps yourself, `uvicorn --reload` (or any watch-mode dev server) restarts the process the moment a watched file changes — including files your *own* code writes. The Python mock app's listing-registered callback (`add_listing_id`) persists to `data/listing-ids.json` **during the request that handles the callback itself**. Without excluding that path from the watch, the write triggers a restart mid-request, which drops the in-flight response back to Mythos and looks exactly like a flaky/slow handshake from the outside — not an obvious "your reloader ate the request" symptom.

The mock app's real run command excludes its own dependency and data directories for this reason:

```bash
uvicorn main:app --port 8001 --reload \
  --reload-exclude '.venv/*' \
  --reload-exclude '__pycache__/*' \
  --reload-exclude 'data/*'
```

If your own `resolveListingIds`/`on_registered` callback also writes to disk, exclude that path too — this isn't generic hygiene, it's a direct consequence of persisting state inside a webhook handler under a reloader.

---

## Not using TypeScript/JavaScript or Python?

### Raw JavaScript, no bundler, no TypeScript

The Node package compiles to plain CommonJS (`tsconfig.json: module: "CommonJS"`, `package.json main: dist/index.js`) — no build step, no bundler, and no TypeScript required to use it:

```javascript
const { requireLaunchToken, reportUsage, handshakeRoute } = require('@mythos-work/sdk');
const express = require('express');

const app = express();
app.use(handshakeRoute());

app.get('/dashboard', requireLaunchToken(), async (req, res) => {
  await reportUsage(req.mythos.sessionJti, { credits: 1, reason: 'page-view' });
  res.json({ ok: true });
});
```

That's the entire Node quickstart with the TypeScript syntax stripped out — nothing else changes.

### Any other language: no official SDK — here's the manual path

> **⚠️ Warning**
> **This path is unofficial and unsupported.** There's no spec beyond the Node/Python SDK source itself, no guaranteed stability, and no support commitment. If you need this, please [file a request for an official SDK](https://github.com/Mythoswork/mythos-sdk/issues) in your language — this section exists so you're not blocked while that happens, not as a long-term recommendation.

Everything below is reverse-engineered directly from `packages/node/src` and `packages/python/mythos_sdk`, since there is no other spec.

**1. Fetch the JWKS key set**

```
GET {MYTHOS_API_URL}/.well-known/jwks.json
```

Returns a standard JWK Set (RFC 7517) with multiple keys — you must match on the JWT header's `kid`, not just grab "the" key:

```json
{
  "keys": [
    { "kty": "RSA", "kid": "06abef38-...", "use": "sig", "alg": "RS256", "n": "...", "e": "AQAB" },
    { "kty": "RSA", "kid": "b53b98b2-...", "use": "sig", "alg": "RS256", "n": "...", "e": "AQAB" }
  ]
}
```

**2. Verify the JWT**

- **Algorithm: `RS256` only.** Both SDKs hardcode `algorithms: ['RS256']` / `algorithms=["RS256"]` at every verification call site — there is no HMAC/shared-secret fallback anywhere in the codebase. Reject any other `alg`, including `none`, explicitly — don't rely on a library default.
- **Clock skew: none configured.** Neither SDK passes any leeway/tolerance option to its JWT library — both rely on the library's default (effectively zero-tolerance) `exp` validation. Match that unless you have a specific reason not to.
- **Token TTLs are backend-controlled**, not SDK constants — by convention (from test fixtures): launch tokens ≈5 minutes, handshake-check and listing-registered tokens ≈2 minutes. `exp` is enforced purely by JWT library validation, not a manual re-check in application code.

**3. Claims per token type**

| Token type | Claims | `iss` checked? | `aud` checked? |
|---|---|---|---|
| Launch | `sub`, `email`, `displayName`, `listingId`, `aud`, `iss`, `jti`, `exp`, `iat` | Yes, must equal `"mythos"` | Yes, must include your listing ID |
| Handshake-check | `sub`, `purpose: "handshake-check"`, `exp`, `iat` | **No** | **No** |
| Listing-registered | `listingId`, `purpose: "listing_registered"`, `iss`, `exp`, `iat` | Yes, must equal `"mythos"` | N/A |

Map a verified launch token to a session object:

```
{ userId: <sub>, email: <email>, displayName: <displayName>, listingId: <listingId>, sessionJti: <jti> }
```

**4. Consume the session (once, on launch)**

```
POST {MYTHOS_API_URL}/api/apps/sessions/{jti}/consume
Content-Type: application/json

{}
```

**5. Report usage (per billable action)**

```
POST {MYTHOS_API_URL}/api/apps/sessions/{jti}/meter
Content-Type: application/json

{ "credits": 1, "reason": "optional string", "charge_id": "<fresh UUIDv4 per call>" }
```

`charge_id` is a caller-generated idempotency key for the backend's dedup — generate a **new** UUID per call unless you're intentionally retrying a specific failed attempt, in which case reuse the same key.

**6. Handle the responses**

| Status | Meaning |
|---|---|
| `402` | Insufficient funds in the consumer's wallet |
| `404` | Session not found (expired or invalid `jti`) |
| `409` on `/consume` | Token already consumed — treat as your own `401` |
| Any other non-2xx, or unreachable/timeout | See "fail closed" below |

> **⚠️ Warning**
> The exact JSON error-body shape for these statuses isn't verifiable from the SDK source or its tests — both SDKs' test suites only assert on status codes, not response bodies, for these paths. Treat status codes as the only guaranteed contract and confirm body shapes against a live/staging environment yourself before hardcoding a parser for them.

**Fail closed on `/consume`.** This is a documented security property (see [Security](../resources/security.md#fail-closed)), not just SDK internals: if `/consume` is unreachable, times out, or returns a 5xx, do not grant access. Both SDKs return their own 503 in this case rather than falling back to "verified but not consumed." Replicate that — a network blip on `/consume` must never be treated as equivalent to a successful consume.

For `/meter`, a 5xx or unreachable call means the usage report didn't land — surface it to your own error handling (retry with the same `charge_id`, or queue for later) rather than silently dropping it, but it's a billing-accuracy concern rather than an auth bypass, so it doesn't need the same fail-closed treatment as `/consume`.

**7. Implement the two `.well-known` routes**

- `GET /.well-known/mythos-handshake?lt=<handshake-check JWT>` — verify per the rules above (purpose `"handshake-check"`, no issuer check), respond `{ "ok": true, "sdk_version": "<your integration's version>" }` on success, `401` on invalid/missing token.
- `GET|POST /.well-known/mythos-listing-registered?lt=<listing-registered JWT>` — verify (purpose `"listing_registered"`, issuer checked), extract `listingId`, respond `{ "ok": true }`. Must accept both `GET` and `POST`.
