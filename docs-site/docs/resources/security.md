# Security

The high-level SDK keeps launch credentials and billing identity out of application code.

- Use `createMythos()` or `create_mythos()` instead of parsing launch tokens.
- Never store Mythos tokens in `localStorage` or `sessionStorage`.
- Keep `MYTHOS_SESSION_SECRET` server-side, at least 32 characters, and set it in the deployment host.
- Serve production apps over HTTPS because the session cookie requires `Secure`.
- Call `confirmCharge` before every billable action and call `charge` only on the server.
- Reuse a client-generated `idempotencyKey` when retrying the same fixed-price action.
- Map `MythosError` to its provided HTTP status instead of exposing internal errors.

The SDK verifies signed launch data, enforces single-use launch exchange, and manages cookie-first session transport. See [Browser client](../getting-started/browser-client.md) and [Errors](../reference/errors.md).
