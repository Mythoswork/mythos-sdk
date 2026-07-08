# mythos-sdk

Official Mythos SDK for Python — launch token verification, usage reporting, and handshake.

## Install

```bash
pip install mythos-sdk[fastapi]
```

## Quick start

```python
from fastapi import FastAPI, Depends
from mythos_sdk import require_launch_token, report_usage, create_handshake_router

app = FastAPI()

# Handshake endpoint — Mythos pings this before publishing your listing
app.include_router(create_handshake_router())

# Protected route — verifies and consumes the launch token automatically
@app.get("/dashboard")
async def dashboard(session = Depends(require_launch_token())):
    # session = MythosSession(user_id, email, display_name, listing_id, session_jti)
    await report_usage(session.session_jti, credits=1, reason="page-view")
    return {"ok": True}
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MYTHOS_LISTING_ID` | Yes* | — | Your listing ID |
| `MYTHOS_LISTING_IDS` | Yes* | — | Comma-separated listing IDs (overrides above) |
| `MYTHOS_API_URL` | No | `https://api.mythos.work` | API base URL override |

*One of `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` is required.

## API

### `require_launch_token()`

FastAPI dependency. Verifies the RS256 launch token from `?lt=`, enforces single-use semantics, and returns a `MythosSession`. Returns `401` if the token is missing, invalid, or already consumed.

### `report_usage(session_jti, *, credits, reason=None)`

Reports credit consumption against a session. Call after delivering value to the user.

### `create_handshake_router()`

Returns a FastAPI `APIRouter` that mounts `GET /.well-known/mythos-handshake`. Mythos calls this endpoint during listing publish to confirm the SDK is installed and reachable.

### `verify_launch_token(token)`

Low-level token verifier. Returns the decoded payload. Use `require_launch_token()` dependency instead for most cases.

## Security

- Tokens verified via RS256 against the Mythos JWKS endpoint
- `alg: none` rejected as a hard block
- Single-use enforcement is non-skippable (ADR-0003)
- JWKS keys cached 10 minutes with automatic re-fetch on key rotation

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
