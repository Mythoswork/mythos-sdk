# requireLaunchToken

Express middleware that verifies a launch token and calls Mythos `/consume`.

## Signature

```typescript
function requireLaunchToken(options?: {
  resolveListingIds?: () => Promise<string[]>;
}): RequestHandler
```

## Parameters

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `resolveListingIds` | `() => Promise<string[]>` | No | Additional listing IDs from dynamic registration |

Reads `lt` from `req.query`.

## Behavior

1. Reject if `lt` missing → 401
2. Call `verifyLaunchToken(token, options)` → 401 on failure
3. Call `POST /api/apps/sessions/{jti}/consume` → 503 on network error, 401 on 409 replay
4. Set `req.mythos` and call `next()`

## Responses

| Status | Body |
|--------|------|
| 200 | *(via `next()`)* — attach session in route handler |
| 401 | `{ "error": "Missing launch token" }` |
| 401 | `{ "error": "Invalid launch token" }` |
| 401 | `{ "error": "Token already consumed" }` |
| 503 | `{ "error": "Could not verify session" }` |

## Example

```typescript
app.get('/api/mythos/session', requireLaunchToken(), (req, res) => {
  res.json({ ok: true, session: req.mythos });
});
```

## See also

- [verifyLaunchToken](verify-launch-token.md)
- [Launch sessions](../../concepts/launch-sessions.md)
