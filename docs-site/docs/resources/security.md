# Security

Security properties and requirements for Mythos SDK integrations.

## Token verification

- Launch tokens verified with **RS256** via Mythos JWKS endpoint
- Issuer claim: `mythos` (fixed identifier, not the API URL)
- Audience must match configured listing ID(s)
- `alg: none` rejected as a hard block

## JWKS caching

Public keys cached for 10 minutes with automatic re-fetch on key rotation (kid miss).

## Single-use enforcement (ADR-0003)

`requireLaunchToken` / `require_launch_token` **always** calls Mythos `/consume`. This is:

- Non-skippable
- Non-configurable
- Required for launch tokens

Never implement custom verify-only middleware that bypasses consume.

## Fail closed

If Mythos `/consume` is unreachable (network error, 5xx), return **503** and do not grant access. Never fall back to unverified sessions.

## Server-side only

:::warning
**Never verify JWTs in browser code.** `@mythos-work/sdk` browser build throws `NOT_IMPLEMENTED` for server functions. All verification happens on your server.
:::

## Token types

Do not mix token purposes:

| Purpose | Handler |
|---------|---------|
| `handshake-check` | `handshakeRoute` only |
| Launch | `requireLaunchToken` only |
| `listing_registered` | `listingCallbackRoute` only |

## URL hygiene

Strip `?lt=` from the browser URL after session exchange (`history.replaceState`). The raw JWT should not remain in browser history.

## Usage reporting

Frontend billing failures must be non-fatal — never block the user flow. Log errors for operational follow-up.

## Environment

- Do not commit `.env` with listing IDs to public repos if they are sensitive
- `MYTHOS_API_URL` override is for dev/staging — production should use `https://api.mythos.work` unless directed otherwise

## Next steps

- [Launch sessions](../concepts/launch-sessions.md)
- [Token types](../concepts/token-types.md)
- [Troubleshooting](troubleshooting.md)
