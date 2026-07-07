---
name: integrate-mythos-sdk
description: Wire Mythos SDK into a Producer app — handshake route, launch token session, usage reporting, frontend ?lt= handling. Use when integrating Mythos, adding ?lt= auth, MYTHOS_LISTING_ID, handshake, report-usage, or listing on the Mythos marketplace.
---

# Integrate Mythos SDK

Wire this Producer app so it can be launched from Mythos, verify launch tokens server-side, and bill credits for usage.

## When to use

- User wants to list app on Mythos marketplace
- User mentions `?lt=`, launch token, handshake, `MYTHOS_LISTING_ID`, or `report-usage`
- User is wiring Mythos auth alongside existing password/OAuth gate

## Full references

Read these from the mythos-sdk repo (or ask user to provide):

- **Copy-paste agent brief:** `docs/PRODUCER_MASTER_PROMPT.md`
- **Stack recipes + architecture:** `docs/PRODUCER_INTEGRATION.md`
- **Code stubs:** `docs/examples/`

## Workflow

### 0. Discover (before coding)

1. Detect stack: Node (Express/Next/Vercel) or Python (FastAPI)
2. Find **all** server entry points — local AND deploy (e.g. `backend/main.py` + `api/index.py`)
3. Find existing auth gate Mythos should bypass when `?lt=` is present
4. Identify billable action(s) for `reportUsage`

### 1. Install

| Stack | Package | Git fallback |
|-------|---------|--------------|
| Node | `@mythos/sdk` | `npm install github:Mythoswork/mythos-sdk#main:packages/node` |
| Python | `mythos-sdk` | `pip install "git+https://github.com/Mythoswork/mythos-sdk.git#subdirectory=packages/python"` |

### 2. Server routes (all three, every entry point)

| Route | SDK |
|-------|-----|
| `GET /.well-known/mythos-handshake?lt=` | `handshakeRoute()` / `handshake_router` |
| `GET /api/mythos/session?lt=` | `requireLaunchToken()` / `require_launch_token` |
| `POST /api/mythos/report-usage` | `reportUsage()` / `report_usage` |

Copy from `docs/examples/` for your stack:
- Express → `express-routes.ts`
- FastAPI → `fastapi-mythos-router.py`
- Next.js → `next-mythos-shim.ts` + route handlers
- Vercel → one handler per route + `vercel.json` rewrite for `.well-known`

### 3. Frontend

Copy `docs/examples/mythos-client.ts` or `mythos-client.js`:

1. On load → read `?lt=` → `fetch /api/mythos/session`
2. On success → store `sessionJti`, skip existing auth
3. `history.replaceState` to strip `lt`
4. On billable success → `POST /api/mythos/report-usage` (non-fatal on error)

### 4. Env

```env
MYTHOS_LISTING_ID=<listing-id>
# MYTHOS_API_URL=https://api.mythos.work
```

Update `.env.example`. Never commit `.env`.

### 5. Verify

```bash
curl -i /.well-known/mythos-handshake           # → 401 Missing launch token
curl -i /.well-known/mythos-handshake?lt=fake  # → 401 Invalid launch token
curl -i /api/mythos/session?lt=fake            # → 401 (not 404)
```

Windows: `curl.exe`. Port 8080 if 8000 blocked.

Real tokens from Mythos: handshake → 200 ok; browser `?lt=` → auth skipped; replay → fails.

## Hard rules

- **Never** verify JWTs in browser — server only
- **Never** skip `/consume` — use SDK middleware/dependency only (ADR-0003)
- Handshake path must be exactly `/.well-known/mythos-handshake`
- Handshake tokens (`purpose: handshake-check`) ≠ launch `?lt=` tokens
- Consume failure → 503, fail closed
- Usage reporting non-fatal on frontend
- Wire **every** production server entry point

## Report back

Branch, entry points wired, env set (yes/no), curl results, browser `?lt=` test, billable action wired, blockers.
