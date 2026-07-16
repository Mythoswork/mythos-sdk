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
