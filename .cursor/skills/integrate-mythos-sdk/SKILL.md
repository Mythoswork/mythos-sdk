---
name: integrate-mythos-sdk
description: Wire Mythos SDK into a Producer app — handshake route, launch token session, usage reporting, listing callback, frontend ?lt= handling. Use when integrating Mythos, adding ?lt= auth, MYTHOS_LISTING_ID, handshake, report-usage, listing-registered callback, or listing on the Mythos marketplace.
---

# Integrate Mythos SDK

Wire this Producer app so it can be launched from Mythos, verify launch tokens server-side, and bill credits for usage.

## When to use

- User wants to list app on Mythos marketplace
- User mentions `?lt=`, launch token, handshake, `MYTHOS_LISTING_ID`, listing callback, or `report-usage`
- User is wiring Mythos auth alongside existing password/OAuth gate

## Full references

Read these from the mythos-sdk repo (or ask user to provide):

- **Docs home:** `docs/README.md`
- **Copy-paste agent brief:** `docs/guides/ai-integration-prompt.md`
- **Required routes:** `docs/guides/required-routes.md`
- **Dynamic listing IDs:** `docs/concepts/dynamic-listing-ids.md`
- **Verify checklist:** `docs/getting-started/verify-integration.md`
- **Code stubs:** `docs/examples/`
- **Mock app:** https://github.com/Mythoswork/mythos-sdk-python-mock-integration-app

## Workflow

### 0. Discover (before coding)

1. Detect stack: Node (Express/Next/Vercel) or Python (FastAPI)
2. Find **all** server entry points — local AND deploy (e.g. `backend/main.py` + `api/index.py`)
3. Find existing auth gate Mythos should bypass when `?lt=` is present
4. Identify billable action(s) for `reportUsage`
5. Decide listing ID strategy: static env var or dynamic listing callback

### 1. Install

| Stack | Package | Git fallback |
|-------|---------|--------------|
| Node | `@mythos-work/sdk` | `npm install github:Mythoswork/mythos-sdk#main:packages/node` |
| Python | `mythos-sdk[fastapi]` | `pip install "git+https://github.com/Mythoswork/mythos-sdk.git#subdirectory=packages/python"` |

### 2. Server routes (every entry point)

| Route | SDK |
|-------|-----|
| `GET /.well-known/mythos-handshake?lt=` | `app.use(handshakeRoute())` / `handshake_router` |
| `GET /api/mythos/session?lt=` | `requireLaunchToken()` / `require_launch_token()` |
| `POST /api/mythos/report-usage` | `reportUsage()` / `report_usage` |
| `GET\|POST /.well-known/mythos-listing-registered?lt=` (optional) | `listingCallbackRoute()` / `create_listing_callback_handler` |

Copy from `docs/examples/` for your stack:
- Express → `express-routes.ts` — use `app.use(handshakeRoute())`
- FastAPI → `fastapi-mythos-router.py` — use `Depends(require_launch_token())`
- Next.js → `next-mythos-shim.ts` + route handlers
- Vercel → one handler per route + `vercel.json` rewrite for `.well-known`

For dynamic listing IDs, pass `resolveListingIds` / `resolve_listing_ids` to verify/middleware.

### 3. Frontend

Copy `docs/examples/mythos-client.ts` or `mythos-client.js`:

1. On load → read `?lt=` → `fetch /api/mythos/session`
2. On success → store `sessionJti`, skip existing auth
3. `history.replaceState` to strip `lt`
4. On billable success → `POST /api/mythos/report-usage` (non-fatal on error)

### 4. Env

```env
MYTHOS_LISTING_ID=<listing-id>
# MYTHOS_LISTING_IDS=id-one,id-two
# MYTHOS_API_URL=https://api.mythos.work
```

Skip `MYTHOS_LISTING_ID` if using listing callback + `resolveListingIds`. Update `.env.example`. Never commit `.env`.

### 5. Verify

```bash
curl.exe -i /.well-known/mythos-handshake           # → 401 Missing launch token
curl.exe -i /.well-known/mythos-handshake?lt=fake  # → 401 Invalid launch token
curl.exe -i /api/mythos/session?lt=fake            # → 401 (not 404)
```

Windows: `curl.exe`. Port 8080 if 8000 blocked.

Real tokens from Mythos or mock app: handshake → 200 ok; browser `?lt=` → auth skipped; replay → fails.

## Hard rules

- **Never** verify JWTs in browser — server only
- **Never** skip `/consume` — use SDK middleware/dependency only (ADR-0003)
- Handshake path: `/.well-known/mythos-handshake` — mount with `app.use(handshakeRoute())` on Node
- Listing callback path: `/.well-known/mythos-listing-registered` (when used)
- Three token types: `handshake-check` ≠ launch ≠ `listing_registered`
- Python: `Depends(require_launch_token())` with parentheses; `session.sessionJti` camelCase
- Consume failure → 503, fail closed
- Usage reporting non-fatal on frontend
- Wire **every** production server entry point

## Report back

Branch, entry points wired, env set (yes/no), listing callback (yes/no), curl results, browser `?lt=` test, billable action wired, blockers.
