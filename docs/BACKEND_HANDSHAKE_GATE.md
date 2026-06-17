# Handshake Publish Gate — Backend Implementation Guide

**Jira**: BE-E (MYT-305)  
**PR**: `Mythoswork/backend#94` · branch `pr/backend-publish-handshake-gate` · base `r/migrate-to-typescript`  
**Depends on**: BE-B (MT-267) — signing key infra must be merged first

---

## What This Is

Before a `web_app` listing transitions from `draft → published`, the backend must
verify that the producer's app is actually running the Mythos SDK. It does this by:

1. Minting a short-lived RS256 test Launch Token
2. `GET`-ing `<launch_url>/.well-known/mythos-handshake?lt=<token>` (5 s timeout)
3. Expecting `200 { ok: true, sdk_version: <string> }`
4. PASS → set `status = 'published'`; FAIL → keep `status = 'draft'`, return error

---

## Handshake Endpoint Contract

The SDK (this repo) exposes the endpoint. The response shape is:

```json
{ "ok": true, "sdk_version": "0.1.0" }
```

The backend must:

- Accept any semver string in `sdk_version` (do not version-lock)
- Treat any non-`true` value for `ok` as failure
- Treat non-200 HTTP status as failure

---

## Implementation Checklist

### 1. Listing model — add `handshakeUrl` field

```typescript
// types/listings.ts
export interface Listing {
  // ...existing fields...
  handshakeUrl?: string;   // base URL of producer's app, e.g. "https://myapp.example.com"
}
```

Migration: nullable `VARCHAR` column on `listings` table, no default.

---

### 2. Handshake service — `services/handshake.service.ts`

```typescript
import { SignJWT } from 'jose';

const HANDSHAKE_TIMEOUT_MS = 5_000;

export type HandshakeResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function verifyHandshake(
  launchUrl: string,
  signingKey: CryptoKey,          // RS256 private key — from BE-B infra
  listingId: string,
): Promise<HandshakeResult> {
  const token = await new SignJWT({ sub: listingId, purpose: 'handshake-check' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(signingKey);

  const url = `${launchUrl.replace(/\/$/, '')}/.well-known/mythos-handshake?lt=${token}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(HANDSHAKE_TIMEOUT_MS) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `handshake request failed: ${msg}` };
  }

  if (res.status !== 200) {
    return { ok: false, reason: `handshake returned HTTP ${res.status}` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: 'handshake response is not valid JSON' };
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    (body as Record<string, unknown>).ok !== true
  ) {
    return { ok: false, reason: 'handshake response missing ok:true' };
  }

  return { ok: true };
}
```

---

### 3. Publish endpoint — `routes/listings.ts`

Intercept the `draft → published` transition for `web_app` listings:

```typescript
// POST /api/listings/:id/publish  (or wherever status transitions live)
import { verifyHandshake } from '../services/handshake.service';

async function publishListing(req: Request, res: Response) {
  const listing = await db.listings.findById(req.params.id);

  // Admin bypass — internal seeding only
  const skip = req.body.skipHandshake === true && req.user?.isAdmin;

  if (listing.type === 'web_app' && listing.handshakeUrl && !skip) {
    const result = await verifyHandshake(
      listing.handshakeUrl,
      signingKey,           // injected from BE-B infra
      listing.id,
    );

    if (!result.ok) {
      logger.warn({ listingId: listing.id, reason: result.reason }, 'handshake failed');
      return res.status(422).json({
        error: 'handshake_failed',
        message: `Producer handshake check failed: ${result.reason}`,
      });
    }
  }

  await db.listings.update(listing.id, { status: 'published' });
  return res.json({ ok: true });
}
```

---

### 4. `skipHandshake` admin override

| Field | Value |
|-------|-------|
| Request body key | `skipHandshake` |
| Type | `boolean` |
| Guard | `req.user.isAdmin === true` — non-admins can send it but it is silently ignored |
| Use case | DB seeding, internal test fixtures |

Do **not** expose this in public API docs or producer-facing error messages.

---

## Error Response Shape

When the handshake fails, return:

```json
HTTP 422
{
  "error": "handshake_failed",
  "message": "Producer handshake check failed: <reason>"
}
```

Possible `<reason>` values:
- `handshake request failed: The operation was aborted` — timeout
- `handshake request failed: fetch failed` — DNS / network error
- `handshake returned HTTP 500` — producer server error
- `handshake response is not valid JSON` — malformed body
- `handshake response missing ok:true` — SDK not installed or wrong route

---

## Integration Tests

| Scenario | Mock | Expected outcome |
|----------|------|-----------------|
| SDK running correctly | Mock returns `200 { ok: true, sdk_version: "0.1.0" }` | `status = 'published'` |
| Producer down | Mock returns `500` | `status = 'draft'`, 422 returned |
| Timeout | Mock delays > 5 s | `status = 'draft'`, 422 returned |
| Network error | Mock throws | `status = 'draft'`, 422 returned |
| `skipHandshake=true` (admin) | No outbound request made | `status = 'published'` |
| `skipHandshake=true` (non-admin) | Handshake runs normally | Depends on endpoint state |

---

## Sequence Diagram

```
Producer (browser)          Backend (BE)                 Producer App (SDK)
     |                          |                               |
     |  POST /listings/:id/publish                              |
     |------------------------->|                               |
     |                          | mint RS256 test token (2 min) |
     |                          |------------------------------>|
     |                          |  GET /.well-known/mythos-handshake?lt=<token>
     |                          |------------------------------>|
     |                          |         200 { ok:true }       |
     |                          |<------------------------------|
     |                          | set status = 'published'      |
     |      200 { ok: true }    |                               |
     |<-------------------------|                               |
```

---

## Acceptance Criteria (from BE-E)

- [ ] Handshake ping runs before status transition for `web_app` listings
- [ ] Listing stays `draft` + descriptive error returned on failure or timeout
- [ ] `skipHandshake=true` admin override bypasses the check
- [ ] 5 s timeout enforced; slow endpoints treated as failure
- [ ] Integration test: mock 200 → published; mock 500 → draft

---

## Related

- **SDK PR #5** (`pr/sdk-handshake-helper`) — Python `handshake_router` / `create_handshake_router()`
- **Node SDK** — `handshakeRoute()` helper in `@mythos/sdk`
- **BE-B** (MT-267) — RS256 signing key infra (must merge first)
- **ADR-0003** — single-use token enforcement
