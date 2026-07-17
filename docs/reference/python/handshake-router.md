# handshake_router

Pre-built FastAPI router with the Mythos publish handshake endpoint.

## Usage

```python
from fastapi import FastAPI
from mythos_sdk import handshake_router

app = FastAPI()
app.include_router(handshake_router)
```

## Route

```
GET /.well-known/mythos-handshake?lt=<handshake-jwt>
```

## Responses

| Status | Body |
|--------|------|
| 200 | `{ "ok": true, "sdk_version": "0.1.0" }` |
| 401 | `{ "error": "Missing launch token" }` |
| 401 | `{ "error": "Invalid launch token" }` |
| 503 | `{ "error": "Service unavailable" }` |

## create_handshake_router

For customization, use the factory:

```python
from mythos_sdk import create_handshake_router

app.include_router(create_handshake_router())
```

Both are equivalent for standard integrations.

## See also

- [Token types](../../concepts/token-types.md)
- [Required routes](../../guides/required-routes.md)
