# Handshake Publish Gate — Backend Implementation Guide

**Jira**: BE-E (MYT-305 + MYT-306) — consolidated card; absorbs MT-270 (BE handshake gate) + MT-271 (SDK handshake helper)  
**SDK PR**: `Mythoswork/mythos-sdk#5` · branch `pr/sdk-handshake-helper` → `main` ✅ **SDK scope complete**  
**BE PR**: `Mythoswork/backend#94` · branch `pr/backend-publish-handshake-gate` · base `r/migrate-to-typescript`  
**Depends on**: BE-B (MT-267) — signing key infra must be merged first

---

## Jira — BE-E · Handshake publish gate + SDK handshakeRoute() helper

> Consolidated card. Absorbs **MT-270** (MYT-305 BE handshake gate) + **MT-271** (MYT-306 SDK handshake helper).  
> Depends on **BE-B (MT-267)** merging first — needs signing key infra to mint test token.

### Scope

**SDK (MYT-306 — `Mythoswork/mythos-sdk`)** ✅ Done
- `handshakeRoute()` / `handshake_router` mounts `GET /.well-known/mythos-handshake`
- Returns `200 { ok: true, sdk_version: '0.1.0' }` when called with a valid test launch token
- Token validated: RS256 signature + `purpose: 'handshake-check'` (commit `d5a5bec`)
- Browser entry-point stub exists (methods throw `NOT_IMPLEMENTED` until Phase 2)
- Tests pass (14/14)

**BE (MYT-305 — `Mythoswork/backend#94`)** 🔜 Pending
- On `POST /api/listings` status transition to `published` for `web_app` type:
  - Mint signed test Launch Token (RS256, short TTL, `purpose: 'handshake-check'`)
  - `GET <launch_url>/.well-known/mythos-handshake?lt=<test_token>` (5 s timeout)
  - Expect `200 { ok: true, sdk_version }`
  - PASS → set `status = 'published'`
  - FAIL → keep `status = 'draft'`, return error to producer with failure reason
- Admin flag `skipHandshake=true` (internal override for seeding)

### Acceptance Criteria

| # | Criteria | Status |
|---|----------|--------|
| 1 | SDK `handshakeRoute()` / `handshake_router` responds correctly to handshake ping | ✅ Done (PR #5) |
| 2 | BE publish flow pings handshake before publishing; blocks on failure | 🔜 Backend PR #94 |
| 3 | Listing stays `draft` + descriptive error if handshake fails or times out | 🔜 Backend PR #94 |
| 4 | `skipHandshake` admin override works | 🔜 Backend PR #94 |
| 5 | Integration test: mock 200 → listing published; mock 500 → stays draft | 🔜 Backend PR #94 |
| 6 | PR reviewed and approved | 🔜 In review |

---

## mythos-sdk Overview

`mythos-sdk` is the official Mythos SDK monorepo (`Mythoswork/mythos-sdk`). Producers install it in their app to handle launch token verification, session consumption, usage metering, and — from v0.1.0 — the handshake endpoint that this gate pings.

### Packages

| Package | Language | Install |
|---------|----------|---------|
| `mythos-sdk` | Python (FastAPI) | `pip install mythos-sdk[fastapi]` |
| `@mythos/sdk` | Node / Express | `npm install @mythos/sdk` |

### Core exports (both packages)

| Symbol | Purpose |
|--------|---------|
| `verifyLaunchToken` / `verify_launch_token` | Verify RS256 launch token from query param `?lt=` |
| `requireLaunchToken` / `require_launch_token` | FastAPI/Express middleware — verifies + consumes token, returns `MythosSession` |
| `reportUsage` / `report_usage` | Meter credits against a session JTI |
| `handshakeRoute()` / `handshake_router` | Mounts `GET /.well-known/mythos-handshake` — this is what the publish gate pings |

### Environment variables (producer's app)

| Var | Required | Default |
|-----|----------|---------|
| `MYTHOS_LISTING_ID` | Yes (or `MYTHOS_LISTING_IDS`) | — |
| `MYTHOS_LISTING_IDS` | Yes (or `MYTHOS_LISTING_ID`, comma-separated) | — |
| `MYTHOS_API_URL` | No | `https://api.mythos.work` |

---

## SDK PR #5 — `pr/sdk-handshake-helper` (MYT-306)

**Branch:** `pr/sdk-handshake-helper` → `main` · **Repo:** `Mythoswork/mythos-sdk`

This PR implements and hardens the handshake endpoint that the publish gate calls.

### What shipped

**Python** (`packages/python/mythos_sdk/handshake.py`)
- `handshake_router` — pre-built FastAPI `APIRouter`, mount with `app.include_router(handshake_router)`
- `create_handshake_router()` — factory for a fresh instance
- Both exported from `mythos_sdk` top-level

**Node** (`packages/node/dist/handshake.js`)
- `handshakeRoute()` — Express `RequestHandler` factory
- Mount with `app.get('/.well-known/mythos-handshake', handshakeRoute())`

### Token validation (commit `d5a5bec`)

The handshake endpoint validates the `?lt=` token the backend sends:
1. Fetches JWKS from `MYTHOS_API_URL/.well-known/jwks.json`
2. Verifies RS256 signature (no audience check — test token has no `aud`)
3. Asserts `payload.purpose === "handshake-check"`
4. Returns `401` if token is missing, expired, or has wrong purpose
5. Returns `200 { ok: true, sdk_version }` only on success

This means a producer cannot pass the gate with a stub endpoint — they must have the SDK installed with network access to the Mythos JWKS.

> **Note:** Node `dist/handshake.js` currently does not validate `?lt=`. No source tree exists in the SDK repo for the Node package. Track fix separately.

### Handshake token claims (what the backend must mint)

```typescript
{ sub: listingId, purpose: 'handshake-check' }
// alg: RS256, exp: now + 2min, no aud
```

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

## Acceptance Criteria — BE scope (from BE-E / MYT-305)

- [ ] Handshake ping runs before status transition for `web_app` listings
- [ ] Listing stays `draft` + descriptive error returned on failure or timeout
- [ ] `skipHandshake=true` admin override bypasses the check
- [ ] 5 s timeout enforced; slow endpoints treated as failure
- [ ] Integration test: mock 200 → published; mock 500 → draft

> SDK scope (MYT-306) is complete — see PR #5 (`pr/sdk-handshake-helper`), all tests passing.

---

## Related

- **SDK PR #5** (`pr/sdk-handshake-helper`) — Python `handshake_router` / `create_handshake_router()`
- **Node SDK** — `handshakeRoute()` helper in `@mythos/sdk`
- **BE-B** (MT-267) — RS256 signing key infra (must merge first)
- **ADR-0003** — single-use token enforcement
