# Token types

Mythos uses distinct signed tokens for publishing, launching, and dynamic listing registration. The high-level SDK handlers validate each token in the correct route and never expose raw token handling to your application code.

| Token | Purpose | SDK route |
|---|---|---|
| Handshake | Proves the app is reachable before publishing | `/.well-known/mythos-handshake` |
| Launch | Starts a single-use Consumer session | `/api/mythos/session` |
| Listing registered | Delivers a dynamically created listing ID | `/.well-known/mythos-listing-registered` |

Your browser code uses `useMythos()` or `initMythos()`, and server code uses the handlers returned by `createMythos()` or the router returned by `create_mythos()`. Do not parse or move these tokens yourself.

See [Launch sessions](launch-sessions.md) and [Dynamic listing IDs](dynamic-listing-ids.md).
