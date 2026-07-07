# Mythos SDK — Producer Master Prompt

Copy everything below the line into your project AI (Cursor, Claude, etc.) to wire up Mythos SDK integration.

---

## Your task

Integrate the **Mythos SDK** into this Producer app so it can be launched from the Mythos platform, verify launch tokens, and bill credits for usage.

**Fill in these values before pasting:**

```
MYTHOS_LISTING_ID=<from Mythos dashboard>
BILLABLE_ACTION=<what to charge for, e.g. "instagram-post", "page-view", "run-complete">
EXISTING_AUTH=<none | password gate | OAuth — describe how users currently sign in>
LOCAL_DEV_PORT=<port to run on, e.g. 8080 — use 8080 on Windows if 8000 is blocked>
```

Do **not** skip discovery or verification. Report results at the end using the checklist in Phase 6.

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

**SDK repo:** https://github.com/Mythoswork/mythos-sdk  
**Full reference:** `docs/PRODUCER_INTEGRATION.md` in mythos-sdk (or ask user to paste it)

---

## Hard rules (never violate)

| Rule | Why |
|------|-----|
| **Never verify JWTs in browser code** | `@mythos/sdk` browser build throws; tokens must be verified server-side only |
| **Never skip `/consume`** | Use SDK `requireLaunchToken()` / `require_launch_token` only (ADR-0003 single-use) |
| **Handshake path must be exact** | `/.well-known/mythos-handshake` — Mythos publish gate pings this URL |
| **Handshake ≠ launch token** | Handshake JWT has `purpose: "handshake-check"`; launch `?lt=` tokens are different |
| **Fail closed on consume errors** | If Mythos `/consume` fails → return 503, do not grant access |
| **Strip `?lt=` from URL after session** | Token is single-use and already consumed; remove from browser history |
| **Usage reporting is non-fatal on frontend** | Never block the user's main flow if billing fails (402/500) |
| **Wire ALL server entry points** | If the app has multiple (e.g. `backend/main.py` AND `api/index.py` on Vercel), Mythos routes must exist on **every** entry point that serves production traffic |

---

## Phase 0 — Discover (mandatory before coding)

Inspect this repo and report:

1. **Language/runtime** — Node (Express / Next.js / Vercel serverless) or Python (FastAPI / Flask) or other
2. **All server entry points** — e.g. `main.py`, `api/index.py`, `server.js`, Next.js `app/` routes. List every file that creates the HTTP server
3. **Existing auth** — password modal, OAuth, session cookies, etc. Mythos `?lt=` should bypass or complement this (per `EXISTING_AUTH` above)
4. **Billable action** — the exact user action that should trigger usage reporting (per `BILLABLE_ACTION` above)
5. **Frontend entry** — where to hook `?lt=` on page load (`app.js`, `layout.tsx`, `index.html`, etc.)

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
pip install mythos-sdk
```

If not on PyPI yet:

```bash
pip install "git+https://github.com/Mythoswork/mythos-sdk.git#subdirectory=packages/python"
```

Add the dependency to `package.json` or `requirements.txt` / `pyproject.toml`.

---

## Phase 2 — Server routes (all three required)

Mount these on **every** production server entry point.

| Route | SDK primitive | Success response |
|-------|---------------|------------------|
| `GET /.well-known/mythos-handshake?lt=` | `handshakeRoute()` / `handshake_router` | `200 {"ok":true,"sdk_version":"..."}` |
| `GET /api/mythos/session?lt=` | `requireLaunchToken()` / `require_launch_token` | Session JSON (see below) |
| `POST /api/mythos/report-usage` | `reportUsage()` / `report_usage` | `200 {"success":true}` or `{"ok":true}` |

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

See stack-specific snippets in `docs/examples/` in mythos-sdk or `docs/PRODUCER_INTEGRATION.md`.

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
# MYTHOS_API_URL=https://api.mythos.work
```

Update `.env.example` with `MYTHOS_LISTING_ID` and a comment. Do **not** commit `.env`.

Fix README if it documents a wrong start command (e.g. `python main.py` when uvicorn is required).

---

## Phase 5 — Verify (run these, report results)

Start the app on `LOCAL_DEV_PORT`. Then:

```bash
# 1. App is up
curl -i http://127.0.0.1:<PORT>/health
# or any known health/root endpoint

# 2. Handshake route exists
curl -i "http://127.0.0.1:<PORT>/.well-known/mythos-handshake"
# Expected: 401 {"error":"Missing launch token"}

# 3. Handshake rejects bad token
curl -i "http://127.0.0.1:<PORT>/.well-known/mythos-handshake?lt=not-a-real-jwt"
# Expected: 401 {"error":"Invalid launch token"}

# 4. Session route exists
curl -i "http://127.0.0.1:<PORT>/api/mythos/session?lt=fake"
# Expected: 401 (invalid token) — NOT 404
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
- [ ] Server running on port ___
- [ ] `GET /health` (or equivalent): ___
- [ ] Handshake no-token → 401 Missing launch token: ___
- [ ] Handshake fake token → 401 Invalid launch token: ___
- [ ] Session fake token → 401 (not 404): ___
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
| Wrong handshake path | 404 on publish | Must be `/.well-known/mythos-handshake` exactly |
| Using placeholder test token | 401 always | Get real JWT from Mythos dashboard |
| Verifying token in frontend | Security hole / SDK throws | Move to server session endpoint |
| Not stripping `?lt=` from URL | Token visible in history | `history.replaceState` after session call |
| Blocking UI on billing failure | Bad UX | Catch errors in `reportMythosUsage`, log only |
