# Troubleshooting

Start every diagnosis with:

```bash
npx @mythos-work/sdk doctor
```

FastAPI projects can also run `python -m mythos_sdk doctor`. Fix every failed check before debugging application code.

## Test launch diagnostics

Test launches report diagnostics; real sessions never do. Reports contain exactly `code`, `step`, and `sdk_version`, with step `verify_launch`, `consume`, `session`, `meter`, or `llm`. Background reports have a two-second timeout and cannot change your app's response. The browser handshake includes `sdk_version` even on localhost.

SDK-side session failures in a test launch show a fixed overlay titled **Mythos test launch failed**, with the matching message, code, and **Reload** button. This applies only to `CONFIG_ERROR`, `PRODUCER_MISMATCH`, `INVALID_LAUNCH_TOKEN`, `LISTING_NOT_REGISTERED`, `MYTHOS_UNREACHABLE`, and `UPSTREAM_ERROR`.

| Code | Message |
|---|---|
| `CONFIG_ERROR` | The app's Mythos SDK is misconfigured. Check MYTHOS_SESSION_SECRET and MYTHOS_KEY. |
| `PRODUCER_MISMATCH` | MYTHOS_KEY belongs to a different Mythos account or was regenerated. |
| `INVALID_LAUNCH_TOKEN` | The app rejected the launch token. Check MYTHOS_API_URL points at this Mythos environment. |
| `LISTING_NOT_REGISTERED` | This listing isn't registered with the app yet. Save the listing again or set MYTHOS_LISTING_ID. |
| `TOKEN_ALREADY_CONSUMED` | The launch token was used twice. Reload to start a new test launch. |
| `SESSION_EXPIRED` | The test session expired. Start a new test launch. |
| `MYTHOS_UNREACHABLE` | The app couldn't reach Mythos. Check its network access and MYTHOS_API_URL. |
| `UPSTREAM_ERROR` | Mythos returned an unexpected error. Try again. |
| `SESSION_REQUIRED` | The app called charge() or llm() without a Mythos session. |
| `INSUFFICIENT_FUNDS` | Charge failed for funds. This shouldn't happen in a test launch; report it. |

## Other symptoms

| Error or symptom | Fix |
|---|---|
| `MYTHOS_KEY is malformed` | Copy the full `mk_` plus 32 base64url characters from Dashboard → Settings → Mythos key. |
| `MYTHOS_KEY is not set` warning | Set the dashboard key in the host environment. This is soft in 0.5.0 and required in 0.6.0; static listing launches without a key remain silent. |
| `SESSION_NOT_FOUND` | Relaunch to establish a current session. |
| `INVALID_USAGE` | Send integer credits and valid charge options. |
| `LLM_SESSION_REQUIRED` / `LLM_IDENTITY_REQUIRED` | Launch through Mythos or supply an LLM fallback. |
| Handshake is 404 | Wire the handler and make `/.well-known/mythos-handshake` reachable. |
| Works locally but not after deploy | Set env vars in the host and rerun doctor in production. |

See the [full error reference](../reference/errors.md) and [deploy checklist](../getting-started/deploy-checklist.md).
