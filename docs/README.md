# Mythos SDK

Official SDK packages for integrating Producer apps with the [Mythos](https://mythos.work) platform — launch token verification, single-use session enforcement, and usage metering.

## Packages

| Package | Language | Registry |
|---------|----------|----------|
| `@mythos-work/sdk` | Node.js / TypeScript | npm |
| `mythos-sdk` | Python | PyPI |

## What the SDK does

1. **Verify launch tokens** — ES256 JWKS-backed verification of the `?lt=` token Mythos embeds in the redirect URL
2. **Own sessions** — `createMythos()` / `create_mythos()` consumes launch tokens once and manages sealed sessions
3. **Bill usage** — browser `confirmCharge` followed by server `charge`; LLM usage settles after the response
4. **Bind Producers** — launch, handshake and listing callback tokens are checked against your `MYTHOS_KEY`

## Choose your path

| Goal | Start here |
|------|------------|
| Integrate in 10 minutes (Node) | [Express](../docs-site/docs/getting-started/quickstart-express.md) · [Next.js](../docs-site/docs/getting-started/quickstart-nextjs-app.md) |
| Integrate in 10 minutes (Python) | [FastAPI](../docs-site/docs/getting-started/quickstart-fastapi.md) |
| Wire up with an AI agent | [AGENTS.md](../AGENTS.md) |
| Understand the full flow | [Launch sessions](../docs-site/docs/concepts/launch-sessions.md) |
| Look up an API symbol | [Node.js reference](../docs-site/docs/reference/node/overview.md) · [Python reference](../docs-site/docs/reference/python/overview.md) |

## Configuration

| Env var | Required | Default | Description |
|---------|----------|---------|-------------|
| `MYTHOS_SESSION_SECRET` | Yes | — | At least 32 characters; generate with `openssl rand -base64 32` |
| `MYTHOS_KEY` | Soft in 0.5.0; required in 0.6.0 | — | Dashboard → Settings → Mythos key; see [binding matrix](../docs-site/docs/reference/configuration.md) |
| `MYTHOS_LISTING_ID` | Yes* | — | Your listing ID from the Mythos dashboard |
| `MYTHOS_LISTING_IDS` | Yes* | — | Comma-separated listing IDs (overrides single ID) |
| `MYTHOS_API_URL` | No | `https://api.mythos.work` | API base URL override |

\*One of `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` is required — unless you use [dynamic listing IDs](../docs-site/docs/concepts/dynamic-listing-ids.md) via the listing callback.

## Mock apps and examples

- [Mock integration apps](../docs-site/docs/resources/mock-integration-apps.md) — end-to-end dev/QA harnesses
- [Code examples](../docs-site/docs/resources/code-examples.md) — copy-paste stubs for Express, FastAPI, Next.js, and frontend clients

## Repository

[github.com/Mythoswork/mythos-sdk](https://github.com/Mythoswork/mythos-sdk)
