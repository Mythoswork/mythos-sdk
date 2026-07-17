# Troubleshooting

Common integration issues and fixes.

## Quick diagnosis

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Handshake 404 | Wrong path or route not on production entry point | Must be `/.well-known/mythos-handshake`; check all deploy entry points |
| Session 404 | Route not registered | Add `/api/mythos/session` to every server entry point |
| Always 401 with real token | Wrong listing ID or placeholder token | Set correct `MYTHOS_LISTING_ID`; get real JWT from Mythos |
| 503 on session | `/consume` unreachable | Check `MYTHOS_API_URL`; ensure backend is running |
| Works locally, fails in prod | Only wired local entry point | Add Mythos routes to Vercel `api/` or production `main` |
| Publish gate fails | Handshake not mounted correctly | Use `app.use(handshakeRoute())` on Node |

## Duplicate entry points

Apps with `backend/main.py` (local) and `api/index.py` (Vercel) need Mythos on **both**. Local-only wiring is the most common production failure.

## Handshake path

Must be exactly `/.well-known/mythos-handshake`. Custom paths fail unless you add a rewrite:

```json
{ "source": "/.well-known/mythos-handshake", "destination": "/api/mythos-handshake" }
```

## Route naming drift

Pick one report-usage path and match frontend + docs:

- `/api/mythos/report-usage` (recommended)
- Not `/api/mythos/usage` or `/api/mythos-usage`

## Session JSON shape mismatch

Node often wraps `{ session: ... }`; Python often returns flat fields. Frontend must match — see [frontend client](../guides/frontend-client.md).

## Body key casing

| Stack | Session field in POST body |
|-------|---------------------------|
| Node frontend → Node API | `sessionJti` |
| Node frontend → Python API | `session_jti` |

## Python-specific

| Mistake | Fix |
|---------|-----|
| `Depends(require_launch_token)` | Use `Depends(require_launch_token())` |
| `session.session_jti` | Use `session.sessionJti` (camelCase) |
| `python main.py` | Use `uvicorn main:app` |

## Node-specific

| Mistake | Fix |
|---------|-----|
| `app.get('/.well-known/...', handshakeRoute())` | Use `app.use(handshakeRoute())` |
| Verifying JWT in browser | Move to server session endpoint |

## Placeholder tokens

Test constants like `VALID_HANDSHAKE_TOKEN` are not real JWTs. Use tokens from Mythos dashboard or [mock apps](mock-integration-apps.md).

## Single-use tokens

Always strip `?lt=` from URL after session exchange. Refresh without new token = auth failure (expected).

## Windows curl

Use `curl.exe`, not PowerShell `curl` (alias for `Invoke-WebRequest`).

## Next steps

- [Verify your integration](../getting-started/verify-integration.md)
- [Required routes](../guides/required-routes.md)
- [Security](security.md)
