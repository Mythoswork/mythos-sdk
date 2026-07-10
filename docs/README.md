# Mythos SDK

Official SDK packages for integrating Producer apps with the [Mythos](https://mythos.work) platform — launch token verification, single-use session enforcement, and usage metering.

## Packages

| Package | Language | Registry |
|---------|----------|----------|
| `@mythos/sdk` | Node.js / TypeScript | npm |
| `mythos-sdk` | Python | PyPI |

## What the SDK does

1. **Verify launch tokens** — RS256 JWKS-backed verification of the `?lt=` token Mythos embeds in the redirect URL
2. **Enforce single-use semantics** — middleware automatically calls `/consume` (ADR-0003); Producers cannot skip this
3. **Report usage** — `reportUsage()` / `report_usage()` debits the Consumer's Mythos wallet after billable actions
4. **Publish handshake** — `handshakeRoute()` / `handshake_router` for the Mythos publish gate
5. **Listing callback** — `listingCallbackRoute()` / `create_listing_callback_handler` for dynamic listing ID registration

## Choose your path

| Goal | Start here |
|------|------------|
| Integrate in 10 minutes (Node) | [Quickstart: Node.js](getting-started/quickstart-node.md) |
| Integrate in 10 minutes (Python) | [Quickstart: Python](getting-started/quickstart-python.md) |
| Wire up with an AI agent | [AI integration prompt](guides/ai-integration-prompt.md) |
| Understand the full flow | [How it works](getting-started/how-it-works.md) |
| Look up an API symbol | [Node.js reference](reference/node/overview.md) · [Python reference](reference/python/overview.md) |

## Configuration

| Env var | Required | Default | Description |
|---------|----------|---------|-------------|
| `MYTHOS_LISTING_ID` | Yes* | — | Your listing ID from the Mythos dashboard |
| `MYTHOS_LISTING_IDS` | Yes* | — | Comma-separated listing IDs (overrides single ID) |
| `MYTHOS_API_URL` | No | `https://api.mythos.work` | API base URL override |

\*One of `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` is required — unless you use [dynamic listing IDs](concepts/dynamic-listing-ids.md) via the listing callback.

## Mock apps and examples

- [Mock integration apps](resources/mock-integration-apps.md) — end-to-end dev/QA harnesses
- [Code examples](resources/code-examples.md) — copy-paste stubs for Express, FastAPI, Next.js, and frontend clients

## Repository

[github.com/Mythoswork/mythos-sdk](https://github.com/Mythoswork/mythos-sdk)
