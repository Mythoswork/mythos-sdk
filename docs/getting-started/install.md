# Install the SDK

Install `@mythos-work/sdk` or `mythos-sdk` and configure environment variables.

{% hint style="info" %}
**Just getting started?** After installing, follow [Quickstart: Node.js](quickstart-node.md) or [Quickstart: Python](quickstart-python.md).
{% endhint %}

## Node.js / TypeScript

```bash
npm install @mythos-work/sdk
```

If the package is not yet on the npm registry:

```bash
npm install github:Mythoswork/mythos-sdk#main:packages/node
```

**Peer dependency:** Express 4+ (for `handshakeRoute`, `requireLaunchToken`, `listingCallbackRoute`).

**Runtime:** Node.js 18+ (uses native `fetch` and `crypto`).

## Python

```bash
pip install "mythos-sdk[fastapi]"
```

The `fastapi` extra installs FastAPI for router helpers. Core verify/report functions work without it.

If the package is not yet on PyPI:

```bash
pip install "git+https://github.com/Mythoswork/mythos-sdk.git#subdirectory=packages/python"
```

For local SDK development:

```bash
pip install -e "/path/to/mythos-sdk/packages/python[fastapi]"
```

**Runtime:** Python 3.11+.

## Environment variables

Add to `.env` (or your deployment config). Never commit secrets — only listing IDs and API URL overrides.

```env
MYTHOS_LISTING_ID=<your-listing-id>
# optional:
# MYTHOS_LISTING_IDS=id-one,id-two
# MYTHOS_API_URL=https://api.mythos.work
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MYTHOS_LISTING_ID` | Yes* | — | Single listing ID from Mythos dashboard |
| `MYTHOS_LISTING_IDS` | Yes* | — | Comma-separated IDs; overrides `MYTHOS_LISTING_ID` |
| `MYTHOS_API_URL` | No | `https://api.mythos.work` | API base URL (use localhost for local backend) |

\*Not required if you use [dynamic listing IDs](../concepts/dynamic-listing-ids.md) via the listing callback and `resolveListingIds` / `resolve_listing_ids`.

## Update `.env.example`

Document required vars for other developers:

```env
MYTHOS_LISTING_ID=
# MYTHOS_API_URL=https://api.mythos.work
```

## Browser imports

Do **not** import server SDK functions in client bundles. The `@mythos-work/sdk` browser export throws `NOT_IMPLEMENTED` for `verifyLaunchToken`, `requireLaunchToken`, and `reportUsage`. All token verification happens server-side.

## Next steps

- [Quickstart: Node.js](quickstart-node.md)
- [Quickstart: Python](quickstart-python.md)
- [Configuration reference (Node)](../reference/node/configuration.md) · [Python](../reference/python/configuration.md)
