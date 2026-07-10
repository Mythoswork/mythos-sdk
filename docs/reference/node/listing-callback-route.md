# listingCallbackRoute

Express handler for the Mythos listing registration callback.

## Signature

```typescript
function listingCallbackRoute(
  onRegistered: (listingId: string) => Promise<void>,
): RequestHandler
```

## Route

```
GET|POST /.well-known/mythos-listing-registered?lt=<listing-registered-jwt>
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `onRegistered` | `(listingId: string) => Promise<void>` | Yes | Called with validated listing ID — persist it |
| `lt` (query) | string | Yes | JWT with `purpose: "listing_registered"` |

## Returns

`RequestHandler` — mount at the well-known path.

## Responses

| Status | Body |
|--------|------|
| 200 | `{ "ok": true }` |
| 401 | `{ "error": "Missing listing callback token" }` |
| 401 | `{ "error": "Invalid listing callback token" }` |
| 503 | `{ "error": "Service unavailable" }` |

## Example

```typescript
import { listingCallbackRoute, requireLaunchToken } from '@mythos/sdk';

const listingIds: string[] = [];

app.use(
  '/.well-known/mythos-listing-registered',
  listingCallbackRoute(async (id) => {
    if (!listingIds.includes(id)) listingIds.push(id);
  }),
);

app.get(
  '/api/mythos/session',
  requireLaunchToken({ resolveListingIds: async () => listingIds }),
  (req, res) => res.json({ ok: true, session: req.mythos }),
);
```

## See also

- [Dynamic listing IDs](../../concepts/dynamic-listing-ids.md)
- [verifyLaunchToken](verify-launch-token.md) — `resolveListingIds` option
