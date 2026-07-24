# Errors (Node.js)

Typed errors thrown by `@mythos-work/sdk`.

## MythosError

Base class for SDK errors.

```typescript
class MythosError extends Error {
  readonly code: string;
}
```

## InsufficientFundsError

```typescript
class InsufficientFundsError extends MythosError
```

| Property | Value |
|----------|-------|
| `code` | `INSUFFICIENT_FUNDS` |
| `message` | `Insufficient funds in wallet` |

Thrown by `reportUsage` when Mythos returns 402.

## SessionNotFoundError

```typescript
class SessionNotFoundError extends MythosError
```

| Property | Value |
|----------|-------|
| `code` | `SESSION_NOT_FOUND` |
| `message` | `Session not found: {jti}` |

Thrown by `reportUsage` when Mythos returns 404.

## MythosConfigError

```typescript
class MythosConfigError extends MythosError
```

| Property | Value |
|----------|-------|
| `code` | `CONFIG_ERROR` |

Thrown by `verifyLaunchToken` when no listing ID is configured — `MYTHOS_LISTING_ID` / `MYTHOS_LISTING_IDS` is unset and `resolveListingIds` (if provided) resolved no IDs. If you use the `requireLaunchToken` middleware instead of calling `verifyLaunchToken` directly, this is caught internally and mapped to a `500` response.

## InvalidLaunchTokenError

```typescript
class InvalidLaunchTokenError extends MythosError
```

| Property | Value |
|----------|-------|
| `code` | `INVALID_LAUNCH_TOKEN` |
| `message` | `Invalid launch token` (default) |

Thrown by `verifyLaunchToken` for a structurally invalid token — missing required claims, missing/invalid `aud`, or a `listingId` claim that doesn't match a configured listing ID. If you use the `requireLaunchToken` middleware instead of calling `verifyLaunchToken` directly, this is caught internally (alongside JOSE verification errors) and mapped to a `401` response.

## InvalidUsageError

```typescript
class InvalidUsageError extends MythosError
```

| Property | Value |
|----------|-------|
| `code` | `INVALID_USAGE` |

Thrown by `reportUsage` when `credits` isn't a positive integer — a caller bug, not an API failure.

## HTTP mapping in route handlers

```typescript
import { MythosError, InsufficientFundsError, SessionNotFoundError } from '@mythos-work/sdk';

try {
  await reportUsage(sessionJti, { credits: 1 });
} catch (err) {
  if (err instanceof InsufficientFundsError) {
    res.status(402).json({ error: err.message, code: err.code });
  } else if (err instanceof SessionNotFoundError) {
    res.status(404).json({ error: err.message, code: err.code });
  } else if (err instanceof MythosError) {
    res.status(402).json({ error: err.message, code: err.code });
  } else {
    res.status(503).json({ error: 'Failed to report usage' });
  }
}
```

## See also

- [reportUsage](report-usage.md)
- [Required routes](../../guides/required-routes.md)
