# Configuration

`createMythos()` and `create_mythos()` read the same environment variables.

| Variable | Required | Description |
|---|---|---|
| `MYTHOS_SESSION_SECRET` | Yes | Session secret of at least 32 characters. Generate with `openssl rand -base64 32`. |
| `MYTHOS_LISTING_ID` | Yes* | One listing ID from the Mythos dashboard. |
| `MYTHOS_LISTING_IDS` | Yes* | Comma-separated listing IDs. |
| `MYTHOS_API_URL` | No | Mythos API origin. Defaults to `https://api.mythos.work`. |
| `MYTHOS_DEBUG` | No | Set to `1` for verbose `[mythos]` logs. |

\*A listing environment variable is not required when `resolveListingIds` or `resolve_listing_ids` supplies at least one ID.

Set secrets in the deployment host's environment, not only in a local env file. See the [deploy checklist](../getting-started/deploy-checklist.md).
