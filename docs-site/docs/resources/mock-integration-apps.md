# Mock integration apps

End-to-end dev/QA harnesses for validating the SDK launch → handshake → consume → meter loop.

:::info
**Not production code** — disposable apps for local testing against `mythos-backend`.
:::

## Python mock app

**Repo:** [github.com/Mythoswork/mythos-sdk-python-mock-integration-app](https://github.com/Mythoswork/mythos-sdk-python-mock-integration-app)

FastAPI functional twin of the Node calculator mockup.

### What it exercises

| Layer | Routes |
|-------|--------|
| Harness | `/`, `/harness/login`, `/harness/wallet`, `/harness/launch` |
| Producer | `/calculator`, `/verify-session`, `/calculate` |
| Well-known | `/.well-known/mythos-handshake`, `/.well-known/mythos-listing-registered` |

### Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env.local

uvicorn main:app --port 8001 --reload
python bootstrap.py   # creates listing, sets MYTHOS_LISTING_ID
```

### SDK patterns demonstrated

- `create_handshake_router()` + `create_listing_callback_handler(add_listing_id)`
- `require_launch_token(resolve_listing_ids=get_listing_ids)`
- `verify_launch_token(body.lt, resolve_listing_ids=get_listing_ids)` for billable routes
- JSON file store for dynamic listing IDs (`data/listing-ids.json`)

### Local SDK install

After pulling SDK changes:

```bash
pip install --force-reinstall --no-deps "mythos-sdk @ file:///path/to/mythos-sdk/packages/python"
```

## Node calculator mockup

**Repo:** `mythos-calculator-mockup` (Node/Next.js) — same flow as the Python app.

Use either mock app to obtain real launch and handshake tokens for [verification](../getting-started/verify-integration.md).

## Bootstrap flow

1. Start mock app locally
2. Run `bootstrap.py` (Python) — creates a published web-app listing via Mythos API
3. Listing callback registers `listing_id` dynamically
4. Use harness UI to login → launch → open calculator with `?lt=`

## Next steps

- [Dynamic listing IDs](../concepts/dynamic-listing-ids.md)
- [Verify your integration](../getting-started/verify-integration.md)
- [FastAPI guide](../guides/fastapi.md)
