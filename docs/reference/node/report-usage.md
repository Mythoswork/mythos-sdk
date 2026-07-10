# reportUsage

Debit the Consumer's Mythos wallet after a billable action.

## Signature

```typescript
function reportUsage(
  jti: string,
  opts: { credits: number; reason?: string },
): Promise<void>
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `jti` | string | Yes | `sessionJti` from launch session |
| `opts.credits` | number | Yes | Credits to debit |
| `opts.reason` | string | No | Human-readable reason for analytics |

## Returns

`Promise<void>` — resolves on success.

## Throws

| Error | HTTP equivalent | Cause |
|-------|-----------------|-------|
| `InsufficientFundsError` | 402 | Consumer wallet empty |
| `SessionNotFoundError` | 404 | Invalid session JTI |
| `Error` | 503 | Other Mythos API failure |

## Internal behavior

Sends `POST /api/apps/sessions/{jti}/meter` with a fresh `charge_id` UUID per call. See [Idempotency](../../guides/idempotency.md).

## Example

```typescript
await reportUsage(req.mythos.sessionJti, { credits: 1, reason: 'page-view' });
```

## See also

- [Usage metering](../../concepts/usage-metering.md)
- [Errors](errors.md)
