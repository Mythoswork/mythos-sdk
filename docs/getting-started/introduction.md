# Introduction

Learn what the Mythos SDK is, who it is for, and what you need before integrating.

{% hint style="info" %}
**Just getting started?** Jump to [Quickstart: Node.js](quickstart-node.md) or [Quickstart: Python](quickstart-python.md).
{% endhint %}

## Roles on the Mythos platform

| Role | Who | What they do |
|------|-----|--------------|
| **Producer** | You — the app developer | Build an app, integrate the SDK, list on the Mythos marketplace |
| **Consumer** | End user | Discovers your app on Mythos, pays with Mythos credits, launches your app |
| **Mythos** | Platform | Issues launch tokens, runs the publish handshake, meters wallet debits |

This documentation is written for **Producers** integrating the SDK into their server and frontend.

## What you install

The Mythos SDK is not a hosted service you call from the browser. It is a library that runs on **your server** and:

- Verifies RS256-signed JWTs from Mythos
- Calls Mythos `/consume` to enforce single-use launch tokens
- Calls Mythos `/meter` to debit the Consumer's wallet after billable actions
- Exposes well-known routes for publish handshake and listing registration

| Package | When to use |
|---------|-------------|
| `@mythos/sdk` | Node.js, Express, Next.js Route Handlers, Vercel serverless |
| `mythos-sdk` | Python, FastAPI, any async Python web framework |

## Prerequisites

Before integrating, you need:

1. **A deployable Producer app** with a public HTTPS URL (or localhost for dev)
2. **A Mythos listing** — created in the Mythos dashboard or via the API
3. **Your listing ID** — from the dashboard, env var, or [dynamic listing callback](concepts/dynamic-listing-ids.md)
4. **A server runtime** — Node 18+ or Python 3.11+

You do **not** need Mythos API keys in your Producer app. The SDK verifies tokens via public JWKS and calls session endpoints scoped to the launch token.

## What you will build

A minimal Producer integration has:

| Piece | Route / behavior |
|-------|------------------|
| Handshake | `GET /.well-known/mythos-handshake?lt=` |
| Session exchange | `GET /api/mythos/session?lt=` (or equivalent) |
| Usage reporting | `POST /api/mythos/report-usage` |
| Frontend hook | Read `?lt=` on load, strip from URL, store `sessionJti` |
| Listing callback (optional) | `GET|POST /.well-known/mythos-listing-registered?lt=` |

See [Required routes](../guides/required-routes.md) for response shapes and status codes.

## Next steps

- [How it works](how-it-works.md) — end-to-end launch and publish flow
- [Install the SDK](install.md) — npm, pip, and GitHub fallbacks
- [AI integration prompt](../guides/ai-integration-prompt.md) — copy-paste brief for Cursor, Claude, etc.
