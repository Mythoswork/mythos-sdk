# Required routes

Every Producer app must expose these routes on **every** server entry point that serves production traffic.

:::info
**Just getting started?** [Quickstart: Node.js](../getting-started/quickstart-node.md) · [Quickstart: Python](../getting-started/quickstart-python.md)
:::

## Route overview

| Route | SDK primitive | Required |
|-------|---------------|----------|
| `GET /.well-known/mythos-handshake?lt=` | `handshakeRoute()` / `handshake_router` | Yes |
| `GET /api/mythos/session?lt=` | `requireLaunchToken()` / `require_launch_token()` | Yes |
| `POST /api/mythos/report-usage` | `reportUsage()` / `report_usage()` | Yes |
| `GET\|POST /.well-known/mythos-listing-registered?lt=` | `listingCallbackRoute()` / `create_listing_callback_handler` | Optional |

:::warning
If your app has multiple entry points (e.g. `backend/main.py` for local dev and `api/index.py` on Vercel), Mythos routes must exist on **every** entry point that serves production traffic.
:::

## 1. Handshake

```
GET /.well-known/mythos-handshake?lt=<handshake-jwt>
```

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{"ok":true,"sdk_version":"0.1.0"}` | SDK installed and reachable |
| 401 | `{"error":"Missing launch token"}` | No `lt` param |
| 401 | `{"error":"Invalid launch token"}` | Bad, expired, or wrong-purpose token |
| 503 | `{"error":"Service unavailable"}` | Unexpected server error |

**Node mount:** `app.use(handshakeRoute())`

**Python mount:** `app.include_router(handshake_router)`

## 2. Session exchange

```
GET /api/mythos/session?lt=<launch-jwt>
```

Verifies signature, validates audience, calls Mythos `/consume`.

| Status | Meaning |
|--------|---------|
| 200 | Token valid and consumed; return session |
| 401 | Missing, invalid, or already-consumed token |
| 503 | Mythos `/consume` unreachable — fail closed |

### Session response shape

**Node (wrapped — recommended):**

```json
{
  "ok": true,
  "session": {
    "userId": "...",
    "email": "...",
    "displayName": "...",
    "listingId": "...",
    "sessionJti": "..."
  }
}
```

**Python (flat — also valid):**

```json
{
  "userId": "...",
  "email": "...",
  "displayName": "...",
  "listingId": "...",
  "sessionJti": "..."
}
```

Pick one shape and use it consistently in frontend code. The [frontend client](frontend-client.md) supports both.

## 3. Report usage

```
POST /api/mythos/report-usage
```

**Node request body:**

```json
{ "sessionJti": "...", "credits": 1, "reason": "page-view" }
```

**Python request body:**

```json
{ "session_jti": "...", "credits": 1, "reason": "page-view" }
```

| Status | Meaning |
|--------|---------|
| 200 | Billed successfully |
| 402 | Insufficient funds |
| 404 | Session not found |
| 503 | Mythos API error |

## 4. Listing callback (optional)

```
GET|POST /.well-known/mythos-listing-registered?lt=<listing-registered-jwt>
```

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{"ok":true}` | Listing ID persisted |
| 401 | `{"error":"Missing listing callback token"}` | No `lt` param |
| 401 | `{"error":"Invalid listing callback token"}` | Bad or wrong-purpose token |
| 503 | `{"error":"Service unavailable"}` | Callback handler failed |

See [Dynamic listing IDs](../concepts/dynamic-listing-ids.md).

## Route naming

Use `/api/mythos/report-usage` consistently. Avoid drift (`/api/mythos/usage`, `/api/mythos-usage`) — pick one path and match your frontend.

## Next steps

- [Express](express.md) · [FastAPI](fastapi.md) · [Next.js](nextjs.md) · [Vercel](vercel-serverless.md)
- [Verify your integration](../getting-started/verify-integration.md)
- [Troubleshooting](../resources/troubleshooting.md)
