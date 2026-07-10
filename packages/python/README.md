# mythos-sdk

Official Mythos SDK for Python — launch token verification, usage reporting, and handshake.

## Install

```bash
pip install mythos-sdk[fastapi]
```

## Quick start

```python
from fastapi import FastAPI, Depends
from mythos_sdk import require_launch_token, report_usage, create_handshake_router, create_listing_callback_handler

app = FastAPI()

# Example storage for dynamically registered listing IDs
registered_listing_ids: set[str] = set()


async def get_listing_ids() -> list[str]:
    return list(registered_listing_ids)


# Handshake endpoint — Mythos pings this before publishing your listing
app.include_router(create_handshake_router())


# Listing registration callback — Mythos calls this after your listing is registered
async def on_registered(listing_id: str) -> None:
    registered_listing_ids.add(listing_id)


app.add_api_route(
    "/.well-known/mythos-listing-registered",
    create_listing_callback_handler(on_registered),
    methods=["GET", "POST"],
)


# Protected route — verifies and consumes the launch token automatically
@app.get("/dashboard")
async def dashboard(session = Depends(require_launch_token(resolve_listing_ids=get_listing_ids))):
    # session = MythosSession(user_id, email, display_name, listing_id, session_jti)
    await report_usage(session.session_jti, credits=1, reason="page-view")
    return {"ok": True}
```

## Environment variables

| Variable             | Required | Default                   | Description                                   |
|----------------------|----------|---------------------------|-----------------------------------------------|
| `MYTHOS_LISTING_ID`  | No*      | —                         | Your listing ID                               |
| `MYTHOS_LISTING_IDS` | No*      | —                         | Comma-separated listing IDs (overrides above) |
| `MYTHOS_API_URL`     | No       | `https://api.mythos.work` | API base URL override                         |

*Optional when you provide `resolve_listing_ids`; otherwise one of `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` is required.

## API

### `require_launch_token(resolve_listing_ids=None)`

FastAPI dependency. Verifies the RS256 launch token from `?lt=`, enforces single-use semantics, and returns a `MythosSession`. Listing IDs are read from `MYTHOS_LISTING_ID(S)` by default; pass `resolve_listing_ids` to supply them dynamically (e.g. from storage populated by `create_listing_callback_handler`). Returns `401` if the token is missing, invalid, or already consumed.

### `report_usage(session_jti, *, credits, reason=None)`

Reports credit consumption against a session. Call after delivering value to the user.

### `create_handshake_router()`

Returns a FastAPI `APIRouter` that mounts `GET /.well-known/mythos-handshake`. Mythos calls this endpoint during listing publish to confirm the SDK is installed and reachable.

### `create_listing_callback_handler(on_registered)`

Returns a FastAPI-compatible async handler. Mount it at the route you configure with `app.add_api_route` (or a router). It validates the `?lt=` token, awaits `on_registered(listing_id)` on success, and responds with `{ "ok": True }`. Use the callback to persist the listing ID so `resolve_listing_ids` can read it. Returns `401` for missing/invalid tokens and `503` for unexpected errors.

### `verify_launch_token(token, resolve_listing_ids=None)`

Low-level token verifier. Validates the launch token and returns the decoded `MythosSession`. Listing IDs are read from `MYTHOS_LISTING_ID(S)` by default; pass `resolve_listing_ids` to supply them dynamically. Use `require_launch_token()` dependency instead for most cases.

## Security

- Tokens verified via RS256 against the Mythos JWKS endpoint
- `alg: none` rejected as a hard block
- Single-use enforcement is non-skippable (ADR-0003)
- JWKS keys cached 10 minutes with automatic re-fetch on key rotation

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
