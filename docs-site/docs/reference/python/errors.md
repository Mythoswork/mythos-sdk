# Errors (Python)

Typed exceptions raised by `mythos-sdk`.

## MythosError

Base exception class.

```python
class MythosError(Exception):
    ...
```

## InsufficientFundsError

Raised when Mythos `/meter` returns 402.

```python
class InsufficientFundsError(MythosError):
    ...
```

## SessionNotFoundError

Raised when Mythos `/meter` returns 404.

```python
class SessionNotFoundError(MythosError):
    ...
```

## MythosConfigError

```python
class MythosConfigError(MythosError):
    ...
```

Exported for parity with the Node SDK and caught explicitly (mapped to a `500`) by the `require_launch_token` dependency. `verify_launch_token` currently raises a bare `RuntimeError` for the same missing-listing-config condition instead of `MythosConfigError`, so via `require_launch_token` that case actually falls through to the generic handler and returns `503`, not `500`.

## InvalidLaunchTokenError

```python
class InvalidLaunchTokenError(MythosError):
    ...
```

Raised by `verify_launch_token` for a structurally invalid token — missing required claims, missing/invalid `aud`, or a `listingId` claim that doesn't match a configured listing ID. If you use the `require_launch_token` dependency instead of calling `verify_launch_token` directly, this is caught internally (alongside `jose` JOSE errors) and mapped to a `401` response.

## InvalidUsageError

```python
class InvalidUsageError(MythosError):
    ...
```

Raised by `report_usage` when `credits` isn't a positive integer — a caller bug, not an API failure.

## HTTP mapping in route handlers

```python
from fastapi import HTTPException
from mythos_sdk import MythosError, InsufficientFundsError, SessionNotFoundError

try:
    await report_usage(session_jti, credits=1)
except InsufficientFundsError as e:
    raise HTTPException(status_code=402, detail=str(e)) from e
except SessionNotFoundError as e:
    raise HTTPException(status_code=404, detail=str(e)) from e
except MythosError as e:
    raise HTTPException(status_code=402, detail=str(e)) from e
```

## See also

- [report_usage](report-usage.md)
