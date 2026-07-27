# create_listing_callback_handler

FastAPI handler factory for the Mythos listing registration callback.

## Signature

```python
def create_listing_callback_handler(
    on_registered: Callable[[str], Awaitable[None]],
) -> Callable[[Request], Awaitable[JSONResponse]]
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `on_registered` | `async (listing_id: str) -> None` | Yes | Persist the validated listing ID |
| `lt` (query) | string | Yes | JWT with `purpose: "listing_registered"` |

## Route

```
GET|POST /.well-known/mythos-listing-registered?lt=<token>
```

## Responses

| Status | Body |
|--------|------|
| 200 | `{ "ok": true }` |
| 401 | `{ "error": "Missing listing callback token" }` |
| 401 | `{ "error": "Invalid listing callback token" }` |
| 503 | `{ "error": "Service unavailable" }` |

## Example

```python
from mythos_sdk import create_listing_callback_handler, require_launch_token

listing_ids: list[str] = []

async def add_listing_id(listing_id: str) -> None:
    if listing_id not in listing_ids:
        listing_ids.append(listing_id)

app.add_api_route(
    "/.well-known/mythos-listing-registered",
    create_listing_callback_handler(add_listing_id),
    methods=["GET", "POST"],
)

@app.get("/api/mythos/session")
async def session(
    s=Depends(require_launch_token(resolve_listing_ids=lambda: get_listing_ids())),
):
    ...
```

## See also

- [Dynamic listing IDs](../../concepts/dynamic-listing-ids.md)
- [listingCallbackRoute (Node)](../node/listing-callback-route.md)
