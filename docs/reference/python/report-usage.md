# report_usage

Debit the Consumer's Mythos wallet after a billable action.

## Signature

```python
async def report_usage(
    jti: str,
    credits: int,
    reason: str | None = None,
) -> None
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `jti` | str | Yes | `sessionJti` from launch session |
| `credits` | int | Yes | Credits to debit |
| `reason` | str \| None | No | Human-readable reason |

## Returns

`None` on success.

## Raises

| Error | Cause |
|-------|-------|
| `InsufficientFundsError` | Mythos returned 402 |
| `SessionNotFoundError` | Mythos returned 404 |
| `httpx.HTTPStatusError` | Other API failures |

## Internal behavior

Sends `POST /api/apps/sessions/{jti}/meter` with auto-generated `charge_id` UUID. See [Idempotency](../../guides/idempotency.md).

## Example

```python
await report_usage(session.sessionJti, credits=1, reason="page-view")
```

## See also

- [Usage metering](../../concepts/usage-metering.md)
- [Errors](errors.md)
