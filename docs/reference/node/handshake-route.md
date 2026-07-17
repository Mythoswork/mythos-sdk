# handshakeRoute

Returns an Express `Router` with the Mythos publish handshake endpoint.

## Signature

```typescript
function handshakeRoute(): Router
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

Express `Router` — mount with `app.use(handshakeRoute())`.

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
import { handshakeRoute } from '@mythos-work/sdk';

const app = express();
app.use(handshakeRoute());
```

{% hint style="warning" %}
Use `app.use(handshakeRoute())`, not `app.get('/.well-known/...', handshakeRoute())`.
{% endhint %}

## See also

- [Token types](../../concepts/token-types.md)
- [Required routes](../../guides/required-routes.md)
