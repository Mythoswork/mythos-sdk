# report_usage

Debit the Consumer's Mythos wallet after a billable action.

## Signature

```python
async def report_usage(
    jti: str,
    credits: int,
    reason: str | None = None,
    *,
    idempotency_key: str | None = None,
) -> None
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `jti` | str | Yes | `sessionJti` from launch session |
| `credits` | int | Yes | Credits to debit |
| `reason` | str \| None | No | Human-readable reason |
| `idempotency_key` | str \| None | No | Caller-supplied dedup key sent as `charge_id`. Same key on retry avoids double-billing. Defaults to a fresh UUID per call. Keyword-only. See [Idempotency](../../guides/idempotency.md). |

## Returns

`None` on success.

## Raises

| Error | Cause |
|-------|-------|
| `InsufficientFundsError` | Mythos returned 402 |
| `SessionNotFoundError` | Mythos returned 404 |
| `httpx.HTTPStatusError` | Other API failures |

## Internal behavior

Sends `POST /api/apps/sessions/{jti}/meter` with `charge_id` set to `idempotency_key` if provided, otherwise a fresh UUID. See [Idempotency](../../guides/idempotency.md).

## Example

```python
await report_usage(session.sessionJti, credits=1, reason="page-view")

# Retry-safe: same idempotency_key on retry won't double-charge.
await report_usage(session.sessionJti, credits=1, reason="page-view", idempotency_key=post_id)
```

## See also

- [Usage metering](../../concepts/usage-metering.md)
- [Errors](errors.md)
