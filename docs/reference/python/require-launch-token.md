# require_launch_token

FastAPI dependency that verifies a launch token and calls Mythos `/consume`.

## Signature

```python
async def require_launch_token(
    lt: str = Query(..., alias="lt"),
) -> MythosSession
```

Reads `lt` from the query string via FastAPI's `Query`.

## Usage

```python
from fastapi import Depends
from mythos_sdk import require_launch_token, MythosSession

@app.get("/api/mythos/session")
async def session(session: MythosSession = Depends(require_launch_token)):
    return session
```

{% hint style="warning" %}
`require_launch_token` is a **dependency itself, not a factory** — always use `Depends(require_launch_token)` with no parentheses. Calling it (`Depends(require_launch_token())`) passes FastAPI an already-invoked coroutine instead of a callable and breaks dependency injection.
{% endhint %}

## HTTP exceptions

| Status | Detail |
|--------|--------|
| 401 | `Invalid launch token` |
| 401 | `Token already consumed` |
| 503 | `Could not verify session` |

## See also

- [verify_launch_token](verify-launch-token.md)
- [Launch sessions](../../concepts/launch-sessions.md)
