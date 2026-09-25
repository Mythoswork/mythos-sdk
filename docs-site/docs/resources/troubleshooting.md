# Troubleshooting

Start every diagnosis with:

```bash
npx @mythos-work/sdk doctor
```

FastAPI projects can also run `python -m mythos_sdk doctor`. Fix every failed check before debugging application code.

| Error or symptom | Fix |
|---|---|
| `CONFIG_ERROR` | Set a session secret of at least 32 characters and configure a listing ID or resolver. |
| `INVALID_LAUNCH_TOKEN` | Launch from the Mythos dashboard and verify the listing ID. |
| `TOKEN_ALREADY_CONSUMED` | Start a new launch; launch tokens are single-use. |
| `SESSION_REQUIRED` | Use the session-aware browser client and open the app from Mythos. |
| `SESSION_EXPIRED` | Call `relaunch()` and retry after a new launch. |
| `INSUFFICIENT_FUNDS` | Ask the Consumer to add credits or choose a cheaper action. |
| `SESSION_NOT_FOUND` | Relaunch to establish a current session. |
| `INVALID_USAGE` | Send integer credits and valid charge options. |
| `UPSTREAM_ERROR` | Retry later and inspect server logs. |
| `MYTHOS_UNREACHABLE` | Check `MYTHOS_API_URL`, networking, and Mythos status. |
| `LLM_SESSION_REQUIRED` / `LLM_IDENTITY_REQUIRED` | Launch through Mythos or supply an LLM fallback. |
| Handshake is 404 | Wire the handler and make `/.well-known/mythos-handshake` reachable. |
| Works locally but not after deploy | Set env vars in the host and rerun doctor in production. |

See the [full error reference](../reference/errors.md) and [deploy checklist](../getting-started/deploy-checklist.md).
