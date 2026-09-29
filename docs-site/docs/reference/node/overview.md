:::caution Advanced — 0.0.x primitives
You don't need this page for a normal integration. Use the [quickstarts](/getting-started/quickstart-nextjs-app) and `createMythos()` instead. These low-level functions remain exported for custom setups.
:::

# Node.js SDK overview

API reference for `@mythos-work/sdk` — the official Mythos SDK for Node.js and TypeScript.

:::info
**Just getting started?** [Quickstart: Next.js](../../getting-started/quickstart-nextjs-app.md)
:::

## Install

```bash
npm install @mythos-work/sdk
```

## Exports

| Export | Type | Description |
|--------|------|-------------|
| `handshakeRoute` | function | Express Router for publish handshake |
| `listingCallbackRoute` | function | Express handler for listing registration callback |
| `requireLaunchToken` | function | Express middleware — verify + consume `?lt=` |
| `verifyLaunchToken` | function | Low-level JWT verify (prefer middleware) |
| `reportUsage` | function | Debit Consumer wallet |
| `MythosError` | class | Base error |
| `MythosConfigError` | class | Missing/invalid SDK config |
| `InvalidLaunchTokenError` | class | Launch token failed claim validation |
| `InsufficientFundsError` | class | Wallet has no credits |
| `SessionNotFoundError` | class | Session JTI not found |
| `InvalidUsageError` | class | Invalid arguments passed to an SDK function |
| `MythosSession` | type | Session object shape |

## MythosSession

```typescript
interface MythosSession {
  userId: string;
  email: string;
  displayName: string;
  listingId: string;
  sessionJti: string;
}
```

Attached to `req.mythos` by `requireLaunchToken` middleware.

## Browser

Do not import server functions in client bundles. The browser build throws `NOT_IMPLEMENTED` for verify, middleware, and report functions.

## Pages

- [handshakeRoute](handshake-route.md)
- [listingCallbackRoute](listing-callback-route.md)
- [requireLaunchToken](require-launch-token.md)
- [verifyLaunchToken](verify-launch-token.md)
- [reportUsage](report-usage.md)
- [Errors](errors.md)
- [Configuration](configuration.md)
