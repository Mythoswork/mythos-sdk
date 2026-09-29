# mythos-sdk

Official Mythos SDK for Python — launch token verification, OpenAI-compatible LLM access, usage reporting, and handshake.

## Quick start (0.1.1)

```python
from mythos_sdk import create_mythos

mythos = create_mythos()
app.include_router(mythos.router)

session = await mythos.get_session(request)  # None in standalone mode
await mythos.charge(request, credits=1, reason='page-view')
client = await mythos.llm(request, api_key=producer_api_key)
billing = mythos.billing(completion)
```

Set `MYTHOS_SESSION_SECRET` to a random secret of at least 32 characters (`openssl rand -base64 32`). See the [migration guide](../../MIGRATION.md) for error handling and advanced integrations.

## Advanced (primitives)

## Install

```bash
pip install "mythos-sdk[fastapi,llm]==0.1.1"
```

## OpenAI-compatible LLM

Use the session returned by `require_launch_token()` to create an official async OpenAI client
that routes through Mythos. The provider key is sent as the normal OpenAI `Authorization` header;
the SDK adds the session identity header internally.

```python
from mythos_sdk.llm import get_llm_billing_metadata, llm

client = llm(session, api_key=provider_key)
completion = await client.chat.completions.create(
    model="openai/gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
)
billing = get_llm_billing_metadata(completion)
```

If no session is available, pass `fallback` to return it unchanged; otherwise `llm()` raises
`MythosError`. `base_url` overrides the default `${MYTHOS_API_URL}/v1`, and `timeout` is in
seconds.

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
async def dashboard(session=Depends(require_launch_token(resolve_listing_ids=get_listing_ids))):
    # session = MythosSession(userId, email, displayName, listingId, sessionJti)
    await report_usage(session.sessionJti, credits=1, reason="page-view")
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

FastAPI dependency. Verifies the ES256 launch token from `?lt=`, enforces single-use semantics, and returns a `MythosSession`. Listing IDs are read from `MYTHOS_LISTING_ID(S)` by default; pass `resolve_listing_ids` to supply them dynamically (e.g. from storage populated by `create_listing_callback_handler`). Returns `401` if the token is missing, invalid, or already consumed.

### `report_usage(session_jti, *, credits, reason=None)`

Reports non-inference product fees against a session. Call after delivering value to the user;
LLM inference is metered by the OpenAI-compatible gateway instead.

### `llm(session, api_key=None, fallback=None, base_url=None, timeout=600.0)`

Returns an official async OpenAI client configured for the Mythos gateway and the session's
identity. Use `get_llm_billing_metadata(completion)` to read server-provided billing metadata.

### `create_handshake_router()`

Returns a FastAPI `APIRouter` that mounts `GET /.well-known/mythos-handshake`. Mythos calls this endpoint during listing publish to confirm the SDK is installed and reachable.

### `create_listing_callback_handler(on_registered)`

Returns a FastAPI-compatible async handler. Mount it at the route you configure with `app.add_api_route` (or a router). It validates the `?lt=` token, awaits `on_registered(listing_id)` on success, and responds with `{ "ok": True }`. Use the callback to persist the listing ID so `resolve_listing_ids` can read it. Returns `401` for missing/invalid tokens and `503` for unexpected errors.

### `verify_launch_token(token, resolve_listing_ids=None)`

Low-level token verifier. Validates the launch token and returns the decoded `MythosSession`. Listing IDs are read from `MYTHOS_LISTING_ID(S)` by default; pass `resolve_listing_ids` to supply them dynamically. Use `require_launch_token()` dependency instead for most cases.

## Security

- Tokens verified via ES256 against the Mythos JWKS endpoint
- `alg: none` rejected as a hard block
- Single-use enforcement is non-skippable (ADR-0003)
- JWKS keys cached 10 minutes with automatic re-fetch on key rotation

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
