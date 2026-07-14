# verify_launch_token

Low-level launch token verification. Prefer `require_launch_token` for route handlers.

## Signature

```python
async def verify_launch_token(
    token: str,
    resolve_listing_ids: Callable[[], Awaitable[list[str]]] | None = None,
) -> MythosSession
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | str | Yes | Launch JWT from `?lt=` |
| `resolve_listing_ids` | `async () -> list[str]` | No | Dynamic listing IDs |

## Returns

`MythosSession` — does **not** call `/consume`.

## Validation

- RS256 via Mythos JWKS (cached 10 min, re-fetch on kid miss)
- Issuer: `mythos`
- Audience: checks **all** `aud` elements when `aud` is a list

## Raises

| Exception | Cause |
|-----------|-------|
| `JWTError` / `JWTClaimsError` | Invalid or expired token |
| `RuntimeError` | No listing IDs configured |

## Example

```python
session = await verify_launch_token(
    body.lt,
    resolve_listing_ids=get_listing_ids,
)
await report_usage(session.sessionJti, credits=1, reason="calculator:add")
```

{% hint style="warning" %}
Direct use skips `/consume`. Prefer `require_launch_token` unless you implement consume yourself.
{% endhint %}

## See also

- [require_launch_token](require-launch-token.md)
