# Token types

Mythos issues three distinct JWT types. Each has a different `purpose` claim and must be handled by the correct SDK primitive.

:::info
**Just getting started?** See [How it works](../getting-started/how-it-works.md) for the full sequence diagram.
:::

## Summary

| Token | `purpose` claim | Query param | SDK handler | When it fires |
|-------|-----------------|-------------|---------------|---------------|
| Handshake | `handshake-check` | `?lt=` | `handshakeRoute()` / `handshake_router` | Mythos publish gate — before listing goes live |
| Launch | *(none — standard launch claims)* | `?lt=` | `requireLaunchToken()` / `require_launch_token` | Consumer opens your app from marketplace |
| Listing registered | `listing_registered` | `?lt=` | `listingCallbackRoute()` / `create_listing_callback_handler` | Mythos notifies your app of a new listing ID |

:::warning
All three use the `lt` query parameter name, but they are **not interchangeable**. Never pass a handshake token to `requireLaunchToken` or vice versa.
:::

## Handshake token

**Purpose:** Prove your Producer app has the SDK installed and is reachable before Mythos publishes your listing.

- **Endpoint:** `GET /.well-known/mythos-handshake?lt=<token>`
- **Validation:** RS256 signature, `purpose === "handshake-check"`
- **Success:** `200 { "ok": true, "sdk_version": "0.1.0" }`
- **Issuer:** Not validated on handshake (launch tokens use issuer `mythos`)

See [handshakeRoute](../reference/node/handshake-route.md).

## Launch token

**Purpose:** Authenticate a Consumer session when they arrive from Mythos.

- **Arrives at:** Your app root or launch URL — `https://your-app/?lt=<token>`
- **Your server:** Verifies signature, issuer `mythos`, audience matches listing ID, calls `/consume`
- **Claims include:** `sub` (userId), `email`, `displayName`, `listingId`, `jti` (sessionJti)
- **Single-use:** After `/consume`, replaying the same token returns 401

See [Launch sessions](launch-sessions.md).

## Listing registered token

**Purpose:** Tell your app its `listingId` when a listing is created programmatically — without manual env vars or redeploy.

- **Endpoint:** `GET|POST /.well-known/mythos-listing-registered?lt=<token>`
- **Validation:** RS256 signature, issuer `mythos`, `purpose === "listing_registered"`
- **Callback:** SDK calls your `onRegistered(listingId)` handler to persist the ID
- **Used with:** `resolveListingIds` / `resolve_listing_ids` on verify/middleware

See [Dynamic listing IDs](dynamic-listing-ids.md).

## Next steps

- [Launch sessions](launch-sessions.md) — verify, consume, fail-closed
- [Required routes](../guides/required-routes.md) — HTTP status tables
- [Security](../resources/security.md) — RS256 and alg:none rejection
