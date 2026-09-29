# Launch sessions

A launch session connects a Consumer, a listing, and server-side billing context.

## Session lifecycle

1. A Consumer launches a listing from Mythos.
2. The SDK's browser client initializes against `/api/mythos/session`.
3. The SDK validates and consumes the launch once, then establishes secure transport.
4. Server routes read the session with `getSession` and perform charges with `charge`.
5. The browser reports `expired` when the session can no longer be used.

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
