# Verify your integration

Run these checks after wiring the SDK to confirm routes exist and fail correctly.

:::info
**Just getting started?** Complete [Quickstart: Node.js](quickstart-node.md) or [Quickstart: Python](quickstart-python.md) first.
:::

Replace `<PORT>` with your dev server port (8080 recommended on Windows if 8000 is blocked).

## Smoke tests (no real tokens)

```bash
# 1. App is up
curl.exe -i http://127.0.0.1:<PORT>/
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

:::warning
On Windows, use `curl.exe` — PowerShell aliases `curl` to `Invoke-WebRequest`, which behaves differently.
:::

## Tests with real tokens

Ask your team or use the [mock integration apps](../resources/mock-integration-apps.md) to obtain real JWTs.

| Test | Expected result |
|------|-----------------|
| Handshake JWT from Mythos publish flow | `200 {"ok":true,"sdk_version":"..."}` |
| Browser `http://127.0.0.1:<PORT>/?lt=<launch-token>` | App loads; existing auth skipped if configured |
| Same launch URL opened again | **Fails** — token already consumed (401) |
| Billable action after launch | `POST /api/mythos/report-usage` returns 200; wallet debited |

## Checklist

Copy this when reporting integration status:

- [ ] Stack detected: ___
- [ ] Entry points wired: ___
- [ ] `MYTHOS_LISTING_ID` set in `.env` (yes/no — do not share the value)
- [ ] Listing callback wired (yes/no)
- [ ] Server running on port ___
- [ ] Handshake no-token → 401 Missing launch token
- [ ] Handshake fake token → 401 Invalid launch token
- [ ] Session fake token → 401 (not 404)
- [ ] Real handshake token → 200 ok (if tested)
- [ ] Browser `?lt=` skips auth (if tested)
- [ ] Replay `?lt=` fails (if tested)
- [ ] Billable action triggers report-usage
- [ ] Blockers / follow-ups: ___

## Common failures

| Symptom | Likely cause |
|---------|--------------|
| Handshake 404 | Wrong path or route not mounted on production entry point |
| Session 404 | Route not registered — check all deploy entry points |
| Always 401 with real token | Wrong `MYTHOS_LISTING_ID`, placeholder token, or clock skew |
| 503 on session | Mythos `/consume` unreachable — check `MYTHOS_API_URL` |

See [Troubleshooting](../resources/troubleshooting.md).

## Next steps

- [AI integration prompt](../guides/ai-integration-prompt.md) — Phase 6 report template
- [Security](../resources/security.md) — fail-closed behavior
- [Mock integration apps](../resources/mock-integration-apps.md) — full loop testing
