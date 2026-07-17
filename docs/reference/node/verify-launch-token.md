# verifyLaunchToken

Low-level launch token verification. Prefer `requireLaunchToken` middleware for route handlers.

## Signature

```typescript
function verifyLaunchToken(
  token: string,
  options?: { resolveListingIds?: () => Promise<string[]> },
): Promise<MythosSession>
```

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Launch JWT from `?lt=` |
| `options.resolveListingIds` | `() => Promise<string[]>` | No | Dynamic listing IDs from callback |

## Returns

`Promise<MythosSession>` — does **not** call `/consume`. Use `requireLaunchToken` for single-use enforcement.

## Validation

- RS256 signature via Mythos JWKS (cached 10 min, re-fetch on kid miss)
- Issuer: `mythos`
- Audience matches `MYTHOS_LISTING_ID` / `MYTHOS_LISTING_IDS` or `resolveListingIds` results

## Throws

| Error | Cause |
|-------|-------|
| JWT verification errors | Invalid signature, expired, wrong issuer |
| `Error` | No listing IDs configured |
| `Error` | Audience mismatch |

## Example

```typescript
import { verifyLaunchToken, reportUsage } from '@mythos-work/sdk';

const session = await verifyLaunchToken(token, {
  resolveListingIds: async () => listingIds,
});
await reportUsage(session.sessionJti, { credits: 1, reason: 'action' });
```

{% hint style="warning" %}
Calling `verifyLaunchToken` directly skips `/consume`. Only use when you implement consume yourself — otherwise use `requireLaunchToken`.
{% endhint %}

## See also

- [requireLaunchToken](require-launch-token.md)
- [Launch sessions](../../concepts/launch-sessions.md)
