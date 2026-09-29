---
slug: /
---

# Introduction

Mythos is a platform where users buy credits once and spend them across apps. Producers integrate the Mythos SDK to make their apps launchable and billable from the Mythos marketplace.

The SDK handles launch token exchange, secure sessions, charge confirmation, wallet charging, LLM billing, and the routes Mythos uses to verify an integration. You work with `createMythos()` in Node or `create_mythos()` in Python instead of wiring those protocols yourself.

## Integrate in 3 steps

1. Install the package and run the scaffold command.
2. Wire the SDK's handler or router into one route.
3. Confirm in the browser, then call `charge` on the server for a billable action.

## Pick your quickstart

- [Next.js App Router](quickstart-nextjs-app.md)
- [Next.js Pages Router](quickstart-nextjs-pages.md)
- [Express](quickstart-express.md)
- [FastAPI](quickstart-fastapi.md)

## Packages

| Package | Runtime |
|---|---|
| `@mythos-work/sdk` | Node.js 20+, Next.js, and Express |
| `mythos-sdk` | Python 3.11+ and FastAPI |

## Next steps

- [Install the SDK](install.md)
- [How it works](how-it-works.md)
- [Use with AI agents](../ai-agents.md)
