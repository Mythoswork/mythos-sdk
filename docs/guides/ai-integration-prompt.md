# AI integration prompt

Copy everything below the line into your project AI (Cursor, Claude, etc.) to wire up Mythos SDK integration.

---

## Your task

Integrate the **Mythos SDK** into this Producer app so it can be launched from the Mythos platform, verify launch tokens, and bill credits for usage.

**Fill in these values before pasting:**

```
MYTHOS_LISTING_ID=<from Mythos dashboard, or leave blank if using listing callback>
USE_LISTING_CALLBACK=<yes | no>
BILLABLE_ACTION=<what to charge for, e.g. "instagram-post", "page-view", "run-complete">
EXISTING_AUTH=<none | password gate | OAuth — describe how users currently sign in>
LOCAL_DEV_PORT=<port to run on, e.g. 8080 — use 8080 on Windows if 8000 is blocked>
STACK=<auto-detect | express | fastapi | nextjs | vercel>
```

Do **not** skip discovery or verification. Report results at the end using the checklist in Phase 6.

**Documentation references** (in mythos-sdk repo):

- Full docs: `docs/README.md` (GitBook root)
- Required routes: `docs/guides/required-routes.md`
- Dynamic listing IDs: `docs/concepts/dynamic-listing-ids.md`
- Verify checklist: `docs/getting-started/verify-integration.md`
- Code stubs: `docs/examples/`
- Mock app: https://github.com/Mythoswork/mythos-sdk-python-mock-integration-app

---

## What Mythos expects

When a Consumer opens this app from Mythos, they arrive at your app URL with a signed JWT in the query string:

```
https://your-app.example/?lt=<launch-token>
```

Your app must:

1. **Handshake** — expose `GET /.well-known/mythos-handshake?lt=<token>` so Mythos can verify the SDK is installed before publishing your listing
2. **Session** — verify the launch token server-side, call Mythos `/consume` (single-use), return session to frontend
3. **Usage** — after a billable action succeeds, debit the Consumer's Mythos wallet via `reportUsage` / `report_usage`
4. **Listing callback (optional)** — expose `GET|POST /.well-known/mythos-listing-registered?lt=<token>` if using dynamic listing IDs

**SDK repo:** https://github.com/Mythoswork/mythos-sdk

---

## Hard rules (never violate)

| Rule | Why |
|------|-----|
| **Never verify JWTs in browser code** | `@mythos/sdk` browser build throws; tokens must be verified server-side only |
| **Never skip `/consume`** | Use SDK `requireLaunchToken()` / `require_launch_token()` only (ADR-0003 single-use) |
| **Handshake path must be exact** | `/.well-known/mythos-handshake` — Mythos publish gate pings this URL |
| **Listing callback path must be exact** | `/.well-known/mythos-listing-registered` — when using dynamic IDs |
| **Three token types — never mix** | `handshake-check` ≠ launch `?lt=` ≠ `listing_registered` |
| **Fail closed on consume errors** | If Mythos `/consume` fails → return 503, do not grant access |
| **Strip `?lt=` from URL after session** | Token is single-use and already consumed; remove from browser history |
| **Usage reporting is non-fatal on frontend** | Never block the user's main flow if billing fails (402/500) |
| **Wire ALL server entry points** | If the app has multiple (e.g. `backend/main.py` AND `api/index.py` on Vercel), Mythos routes must exist on **every** entry point that serves production traffic |
| **Node: `handshakeRoute()` must be path-mounted** | It's a bare handler with no route matching of its own and never calls `next()` — use `app.use('/.well-known/mythos-handshake', handshakeRoute())`, never unpathed |
| **Python: `require_launch_token` is used directly, not called** | Use `Depends(require_launch_token)` — no parentheses |
| **Python: camelCase session fields** | `session.sessionJti`, not `session_jti` on the dataclass |

---

## Phase 0 — Discover (mandatory before coding)

Inspect this repo and report:

1. **Language/runtime** — Node (Express / Next.js / Vercel serverless) or Python (FastAPI / Flask) or other
2. **All server entry points** — e.g. `main.py`, `api/index.py`, `server.js`, Next.js `app/` routes. List every file that creates the HTTP server
3. **Existing auth** — password modal, OAuth, session cookies, etc. Mythos `?lt=` should bypass or complement this (per `EXISTING_AUTH` above)
4. **Billable action** — the exact user action that should trigger usage reporting (per `BILLABLE_ACTION` above)
5. **Frontend entry** — where to hook `?lt=` on page load (`app.js`, `layout.tsx`, `index.html`, etc.)
6. **Listing ID strategy** — static env var, or dynamic via listing callback (per `USE_LISTING_CALLBACK`)

Stop and ask the user if stack is ambiguous or there are multiple conflicting entry points.

---

## Phase 1 — Install SDK

### Node.js / TypeScript

```bash
npm install @mythos/sdk
```

If not on npm registry yet:

```bash
npm install github:Mythoswork/mythos-sdk#main:packages/node
```

### Python

```bash
pip install "mythos-sdk[fastapi]"
```

If not on PyPI yet:

```bash
pip install "git+https://github.com/Mythoswork/mythos-sdk.git#subdirectory=packages/python"
```

Add the dependency to `package.json` or `requirements.txt` / `pyproject.toml`.

---

## Phase 2 — Core server routes

Mount these on **every** production server entry point.

| Route | SDK primitive | Success response |
|-------|---------------|------------------|
| `GET /.well-known/mythos-handshake?lt=` | `handshakeRoute()` / `handshake_router` | `200 {"ok":true,"sdk_version":"..."}` |
| `GET /api/mythos/session?lt=` | `requireLaunchToken()` / `require_launch_token()` | Session JSON (see below) |
| `POST /api/mythos/report-usage` | `reportUsage()` / `report_usage` | `200 {"success":true}` or `{"ok":true}` |

### Node.js (Express)

```typescript
import {
  handshakeRoute,
  requireLaunchToken,
  reportUsage,
  MythosError,
} from '@mythos/sdk';

app.use('/.well-known/mythos-handshake', handshakeRoute());  // path is required — see hard rules

app.get('/api/mythos/session', requireLaunchToken(), (req, res) => {
  res.json({ ok: true, session: req.mythos });
});

app.post('/api/mythos/report-usage', async (req, res) => {
  const { sessionJti, credits, reason } = req.body;
  try {
    await reportUsage(sessionJti, { credits, reason });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof MythosError) {
      res.status(402).json({ error: err.message });
      return;
    }
    res.status(503).json({ error: 'Failed to report usage' });
  }
});
```

### Python (FastAPI)

```python
from fastapi import Depends, HTTPException
from mythos_sdk import (
    MythosError,
    MythosSession,
    handshake_router,
    report_usage,
    require_launch_token,
)

app.include_router(handshake_router)

@app.get("/api/mythos/session")
async def mythos_session(session: MythosSession = Depends(require_launch_token)):
    return {
        "userId": session.userId,
        "email": session.email,
        "displayName": session.displayName,
        "listingId": session.listingId,
        "sessionJti": session.sessionJti,
    }

@app.post("/api/mythos/report-usage")
async def mythos_report_usage(request: ReportUsageRequest):
    try:
        await report_usage(request.session_jti, request.credits, request.reason)
    except MythosError as e:
        raise HTTPException(status_code=402, detail=str(e)) from e
    return {"success": True}
```

See stack-specific snippets in `docs/examples/` or `docs/guides/`.

### Session response shape

**Node** (wrapped — recommended):

```json
{ "ok": true, "session": { "userId": "...", "email": "...", "displayName": "...", "listingId": "...", "sessionJti": "..." } }
```

**Python** (flat — also fine):

```json
{ "userId": "...", "email": "...", "displayName": "...", "listingId": "...", "sessionJti": "..." }
```

Pick one shape and use it consistently in frontend code.

### Report-usage request body

**Node:** `{ "sessionJti": "...", "credits": 1, "reason": "instagram-post" }`  
**Python:** `{ "session_jti": "...", "credits": 1, "reason": "instagram-post" }`

Map HTTP errors: `402` insufficient funds, `404` invalid session, `503` Mythos API unreachable.

---

## Phase 2b — Listing callback (if `USE_LISTING_CALLBACK=yes` or no static listing ID)

Wire the listing registration callback and dynamic ID resolution.

### Node.js

```typescript
import { listingCallbackRoute, requireLaunchToken } from '@mythos/sdk';

const listingIds: string[] = [];

async function saveListingId(id: string): Promise<void> {
  if (!listingIds.includes(id)) listingIds.push(id);
}

app.use(
  '/.well-known/mythos-listing-registered',
  listingCallbackRoute(saveListingId),
);

app.get(
  '/api/mythos/session',
  requireLaunchToken({ resolveListingIds: async () => listingIds }),
  (req, res) => res.json({ ok: true, session: req.mythos }),
);
```

### Python

```python
from mythos_sdk import create_listing_callback_handler, require_launch_token

listing_ids: list[str] = []

async def add_listing_id(listing_id: str) -> None:
    if listing_id not in listing_ids:
        listing_ids.append(listing_id)

async def get_listing_ids() -> list[str]:
    return listing_ids

app.add_api_route(
    "/.well-known/mythos-listing-registered",
    create_listing_callback_handler(add_listing_id),
    methods=["GET", "POST"],
)

@app.get("/api/mythos/session")
async def session(s=Depends(require_launch_token(resolve_listing_ids=get_listing_ids))):
    ...
```

Persist listing IDs to disk or database — see mock app: https://github.com/Mythoswork/mythos-sdk-python-mock-integration-app

---

## Phase 3 — Frontend `?lt=` flow

On app load (before or instead of existing auth):

1. Read `lt` from `window.location.search`
2. If present → `fetch('/api/mythos/session?lt=' + encodeURIComponent(lt))`
3. On `200` → store `sessionJti` (and user info if needed); skip existing auth gate per `EXISTING_AUTH`
4. Always `history.replaceState` to remove `lt` from URL (even on failure)
5. After **successful** billable action → `POST /api/mythos/report-usage` with stored `sessionJti`

If no `?lt=` param, app behaves exactly as before — Mythos is optional at runtime.

Template: `docs/examples/mythos-client.ts` or `docs/examples/mythos-client.js`

---

## Phase 4 — Environment and docs

Add to `.env` (repo root or wherever the server loads env):

```env
MYTHOS_LISTING_ID=<listing-id>
# optional:
# MYTHOS_LISTING_IDS=id-one,id-two
# MYTHOS_API_URL=https://api.mythos.work
```

Skip `MYTHOS_LISTING_ID` if using listing callback with `resolveListingIds` / `resolve_listing_ids`.

Update `.env.example` with `MYTHOS_LISTING_ID` and a comment. Do **not** commit `.env`.

Fix README if it documents a wrong start command (e.g. `python main.py` when uvicorn is required).

---

## Phase 5 — Verify (run these, report results)

Start the app on `LOCAL_DEV_PORT`. Then:

```bash
# 1. App is up
curl.exe -i http://127.0.0.1:<PORT>/health
# or any known health/root endpoint

# 2. Handshake route exists
curl.exe -i "http://127.0.0.1:<PORT>/.well-known/mythos-handshake"
# Expected: 401 {"error":"Missing launch token"}

# 3. Handshake rejects bad token
curl.exe -i "http://127.0.0.1:<PORT>/.well-known/mythos-handshake?lt=not-a-real-jwt"
# Expected: 401 {"error":"Invalid launch token"}

# 4. Session route exists
curl.exe -i "http://127.0.0.1:<PORT>/api/mythos/session?lt=fake"
# Expected: 401 (invalid token) — NOT 404

# 5. Listing callback exists (if wired)
curl.exe -i "http://127.0.0.1:<PORT>/.well-known/mythos-listing-registered"
# Expected: 401 {"error":"Missing listing callback token"}
```

**Windows:** use `curl.exe`, not PowerShell `curl` (alias for `Invoke-WebRequest`).

**Real tokens** (ask user if you don't have them):

- Handshake JWT from Mythos publish flow → expect `200 {"ok":true,"sdk_version":"..."}`
- Launch URL `http://127.0.0.1:<PORT>/?lt=<real-token>` → password/auth skipped, app loads
- Open same launch URL again → should **fail** (token already consumed)

---

## Phase 6 — Report back to user

Provide this checklist:

- [ ] Stack detected: ___
- [ ] Entry points wired: ___
- [ ] `MYTHOS_LISTING_ID` set in `.env` (confirm yes/no, not the value)
- [ ] Listing callback wired (yes/no)
- [ ] `resolveListingIds` / `resolve_listing_ids` connected (yes/no)
- [ ] Server running on port ___
- [ ] `GET /health` (or equivalent): ___
- [ ] Handshake no-token → 401 Missing launch token: ___
- [ ] Handshake fake token → 401 Invalid launch token: ___
- [ ] Session fake token → 401 (not 404): ___
- [ ] Listing callback no-token → 401 (if wired): ___
- [ ] Real handshake token → 200 ok (if tested): ___
- [ ] Browser `?lt=` skips auth (if tested): ___
- [ ] Replay `?lt=` fails (if tested): ___
- [ ] Billable action `BILLABLE_ACTION` triggers report-usage: ___
- [ ] Blockers / follow-ups: ___

---

## Common mistakes to avoid

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Only wired local entry, not Vercel `api/index.py` | Works locally, 404 in production | Add mythos routes to every deploy entry point |
| Handshake mounted unpathed (`app.use(handshakeRoute())`) | Intercepts every request to the app | Mount at the exact path: `app.use('/.well-known/mythos-handshake', handshakeRoute())` |
| Wrong handshake path | 404 on publish | Must be `/.well-known/mythos-handshake` exactly |
| `Depends(require_launch_token())` with `()` | FastAPI dependency error | Use `Depends(require_launch_token)` — no parentheses |
| `session.session_jti` in Python | AttributeError | Use `session.sessionJti` (camelCase) |
| Using placeholder test token | 401 always | Get real JWT from Mythos dashboard or mock app |
| Verifying token in frontend | Security hole / SDK throws | Move to server session endpoint |
| Not stripping `?lt=` from URL | Token visible in history | `history.replaceState` after session call |
| Blocking UI on billing failure | Bad UX | Catch errors in report call, log only |
| Mixing token types | 401 on valid-looking JWT | Use correct handler per token purpose |
