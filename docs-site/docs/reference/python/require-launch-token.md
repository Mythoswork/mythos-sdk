# require_launch_token

FastAPI dependency factory that verifies a launch token and calls Mythos `/consume`.

## Signature

```python
def require_launch_token(
    resolve_listing_ids: Callable[[], Awaitable[list[str]]] | None = None,
) -> Callable[..., Awaitable[MythosSession]]
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `resolve_listing_ids` | `async () -> list[str]` | No | Dynamic listing IDs from callback |

Reads `lt` from query string.

## Usage

```python
from fastapi import Depends
from mythos_sdk import require_launch_token, MythosSession

@app.get("/api/mythos/session")
async def session(session: MythosSession = Depends(require_launch_token())):
    return session
```

:::warning
`require_launch_token` is a **factory** — always use `Depends(require_launch_token())` with parentheses.
:::

## HTTP exceptions

| Status | Detail |
|--------|--------|
| 401 | `Invalid launch token` |
| 401 | `Token already consumed` |
| 503 | `Could not verify session` |

## See also

- [verify_launch_token](verify-launch-token.md)
- [Launch sessions](../../concepts/launch-sessions.md)
