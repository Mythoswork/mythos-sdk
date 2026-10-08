# Configuration

`createMythos()` and `create_mythos()` read the same environment variables.

| Variable | Required | Description |
|---|---|---|
| `MYTHOS_SESSION_SECRET` | Yes | Session secret of at least 32 characters. Generate with `openssl rand -base64 32`. |
| `MYTHOS_KEY` | Soft in 0.5.0; required in 0.6.0 | Copy from Dashboard → Settings → Mythos key. Binds tokens to this Producer. |
| `MYTHOS_LISTING_ID` | Yes* | One listing ID from the Mythos dashboard. |
| `MYTHOS_LISTING_IDS` | Yes* | Comma-separated listing IDs. |
| `MYTHOS_API_URL` | No | Mythos API origin. Defaults to `https://api.mythos.work`. |
| `MYTHOS_DEBUG` | No | Set to `1` for verbose `[mythos]` logs. |

\*A listing environment variable is not required when `resolveListingIds` or `resolve_listing_ids` supplies at least one ID.

Set secrets in the deployment host's environment, not only in a local env file. See the [deploy checklist](../getting-started/deploy-checklist.md).

```dotenv
MYTHOS_SESSION_SECRET=   # openssl rand -base64 32  (>= 32 chars)
MYTHOS_KEY=              # Mythos dashboard → Settings → Mythos key
```

## Producer binding (0.5.0)

The Mythos-generated key is a non-secret identifier, `mk_` plus 32 base64url characters. Copy it into server deployment configuration; regenerating it requires updating the environment and redeploying. This prevents another Producer from auto-registering their Listing against your app and earning through it.

Launch, handshake (`purpose: handshake-check`) and listing callback (`purpose: listing_registered`) tokens carry the same `pkh`: base64url without padding of SHA-256 of the UTF-8 bytes of the **full key string**, including `mk_`. The backend omits the claim when the owner has no key.

Literal conformance vector (hash fixture, not a valid deployment key):

```text
MYTHOS_KEY=mk_test
pkh=7i08_9pmD6r4prkeKSsCnOFaCAduf8cz4ogjmhGlpG0
```

| `MYTHOS_KEY` | Token `pkh` | Result |
|---|---|---|
| Set | Equals hash(key) | Accept |
| Set | Different or missing | Reject with `ProducerMismatchError`, `PRODUCER_MISMATCH`, HTTP 401 |
| Unset | Anything | Accept; warn once per process if a launch Listing is outside static `MYTHOS_LISTING_ID(S)`. Handshake and callback validation without a key also warn once. |

Static `MYTHOS_LISTING_ID(S)` launches without a key are safe legacy configuration and remain silent in 0.5.0. A configured `resolveListingIds` / `resolve_listing_ids` or `onListingRegistered` / `on_listing_registered` without a key warns at startup, counting as the once. Missing keys are a soft warning in 0.5.0; **`MYTHOS_KEY` will be required in 0.6.0**.

Exact warning (with the `[mythos]` prefix):

> MYTHOS_KEY is not set: this app accepts Listings auto-registered by any Mythos Producer. Copy your key from the Mythos dashboard into MYTHOS_KEY. It will be required in 0.6.0.

A malformed configured key makes `createMythos()` / `create_mythos()` throw `MythosConfigError` with `MYTHOS_KEY is malformed. Copy it again from the Mythos dashboard.` Deploy backend P1 before configuring a key: older tokens with no `pkh` are rejected when a key is set.

Mismatch responses and exact error copy are in [Errors](./errors.md). Mismatch logs contain `<handshake|listing-callback|session>: producer mismatch` with `{ listingId }` only. Never log the key, `pkh`, or token.
