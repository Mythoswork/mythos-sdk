# reportUsage

Debit the Consumer's Mythos wallet after a billable action.

## Signature

```typescript
function reportUsage(
  jti: string,
  opts: { credits: number; reason?: string; idempotencyKey?: string },
): Promise<void>
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `jti` | string | Yes | `sessionJti` from launch session |
| `opts.credits` | number | Yes | Credits to debit |
| `opts.reason` | string | No | Human-readable reason for analytics |
| `opts.idempotencyKey` | string | No | Caller-supplied dedup key sent as `charge_id`. Same key on retry avoids double-billing. Defaults to a fresh UUID per call. See [Idempotency](../../guides/idempotency.md). |

## Returns

`Promise<void>` — resolves on success.

## Throws

| Error | HTTP equivalent | Cause |
|-------|-----------------|-------|
| `InsufficientFundsError` | 402 | Consumer wallet empty |
| `SessionNotFoundError` | 404 | Invalid session JTI |
| `Error` | 503 | Other Mythos API failure |

## Internal behavior

Sends `POST /api/apps/sessions/{jti}/meter` with `charge_id` set to `opts.idempotencyKey` if provided, otherwise a fresh UUID per call. See [Idempotency](../../guides/idempotency.md).

## Example

```typescript
await reportUsage(req.mythos.sessionJti, { credits: 1, reason: 'page-view' });

// Retry-safe: same idempotencyKey on retry won't double-charge.
await reportUsage(req.mythos.sessionJti, { credits: 1, reason: 'page-view', idempotencyKey: postId });
```

## See also

- [Usage metering](../../concepts/usage-metering.md)
- [Errors](errors.md)
