---
slug: /
---

# Introduction

Mythos is a platform where users buy credits once and spend them across apps. Producers integrate the Mythos SDK to make their apps launchable and billable from the Mythos marketplace.

The SDK handles launch token exchange, secure sessions, charge confirmation, wallet charging, LLM billing, and the routes Mythos uses to verify an integration. You work with `createMythos()` in Node or `create_mythos()` in Python instead of wiring those protocols yourself.

## Integrate with your AI tool

The fastest route: install the Mythos skill once, then ask your coding agent to add Mythos to your app. The skill sets up the SDK and checks the result with `doctor`.

Claude Code (2.1.275 or later):

```text
/plugin install mythos --marketplace Mythoswork/mythos-sdk
```

Other tools (Cursor, Codex, Devin and more):

```bash
npx skills@latest add Mythoswork/mythos-sdk --skill integrate-mythos-sdk
```

Then ask your agent:

> Add Mythos to this app.

See [Use with AI agents](../ai-agents.md) for what each tool installs.

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
- [Launch sessions](../concepts/launch-sessions.md)
- [Use with AI agents](../ai-agents.md)
