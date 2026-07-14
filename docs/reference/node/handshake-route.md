# handshakeRoute

Returns an Express request handler for the Mythos publish handshake endpoint. It has no path or method matching of its own and never calls `next()` — it must be mounted at the exact handshake path.

## Signature

```typescript
function handshakeRoute(): RequestHandler
```

## Route

```
GET /.well-known/mythos-handshake?lt=<handshake-jwt>
```

## Parameters

| Query param | Required | Description |
|-------------|----------|-------------|
| `lt` | Yes | Handshake JWT with `purpose: "handshake-check"` |

## Returns

`RequestHandler` — mount at the exact path with `app.use('/.well-known/mythos-handshake', handshakeRoute())`.

## Responses

| Status | Body |
|--------|------|
| 200 | `{ "ok": true, "sdk_version": "0.1.0" }` |
| 401 | `{ "error": "Missing launch token" }` |
| 401 | `{ "error": "Invalid launch token" }` |
| 503 | `{ "error": "Service unavailable" }` |

## Example

```typescript
import express from 'express';
import { handshakeRoute } from '@mythos/sdk';

const app = express();
app.use('/.well-known/mythos-handshake', handshakeRoute());
```

{% hint style="warning" %}
Always mount at `/.well-known/mythos-handshake` explicitly. Mounting unpathed (`app.use(handshakeRoute())`) intercepts every request to your app, since the handler matches all methods/paths at its mount point and never calls `next()`.
{% endhint %}

## See also

- [Token types](../../concepts/token-types.md)
- [Required routes](../../guides/required-routes.md)
