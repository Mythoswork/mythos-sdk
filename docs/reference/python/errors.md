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
