# Launch sessions

A launch session connects a Consumer, a listing, and server-side billing context.

## Session lifecycle

1. A Consumer launches a listing from Mythos.
2. The SDK's browser client initializes against `/api/mythos/session`.
3. The SDK validates and consumes the launch once, then establishes secure transport.
4. Server routes read the session with `getSession` and perform charges with `charge`.
5. The browser calls the session route ahead of identity-token expiry; the SDK refreshes its identity and rewrites the cookie.
6. At hard expiry the browser reports `expired` and, when embedded, requests a new dashboard launch automatically.

## Lifetime and refresh

The launch token is single-use and must be consumed within its five-minute launch window. Once consumed on the updated backend, its session has an **absolute eight-hour lifetime**. The sealed session cookie expires at that boundary. The LLM identity token remains short-lived (normally 30 minutes), but the browser revisits `/api/mythos/session` five minutes before its expiry to obtain a new token. A server-side `llm()` call can also refresh inline; that refresh does not rewrite the browser cookie, so create an `llm()` client per request.

The session response includes `data.session` (public fields only), `sessionToken` (SDK-managed transport), `expiresAt`, and `refreshAt` (ISO timestamps; `refreshAt` is null without an identity token). Do not expose the identity token to the browser. When a background tab becomes visible, the browser checks whether refresh is overdue. A refresh call omits the original `?lt=` launch token.

```text
Dashboard launch → SDK session route → consume → sealed cookie (up to 8 h)
Browser timer/visibility → SDK session route → backend refresh → new cookie
Server llm() → backend refresh if due → one request-scoped LLM client
Hard expiry → SESSION_EXPIRED → embedded browser requests dashboard relaunch
```

On an older backend without `/sessions/:jti/refresh`, the SDK keeps the current session without failing the refresh request; the session ends at its original identity expiry. Pre-0.4 cookies need one relaunch because sealed Node and Python cookies now use the shared `v1.` format. Legacy low-level encoding primitives are unchanged.

## Session shape

| Field | Description |
|---|---|
| `userId` | Consumer's Mythos user ID |
| `email` | Consumer email |
| `displayName` | Consumer display name |
| `listingId` | Listing that was launched |
| `sessionJti` | Session identifier managed by the SDK |

```ts
const session = await mythos.getSession(req);
if (!session) return handleStandaloneRequest(req);
```

`null` means the app was opened standalone, not that initialization failed. See [Standalone mode](../recipes/standalone-mode.md).

## Browser transport

The SDK prefers an HTTP-only session cookie and manages a fallback when cookies are blocked. Application code must not store Mythos tokens in browser storage. Use the session-aware `fetch` returned by [the browser client](../getting-started/browser-client.md).
