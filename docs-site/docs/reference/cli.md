# CLI

The Node package provides `init` for scaffolding, `doctor` for diagnosis, and `agents` for coding-agent setup. Python provides the same server-side diagnosis through its module entry point.

## `init`

```bash
npx @mythos-work/sdk init
```

The command detects Next.js App Router, Next.js Pages Router, Express, or FastAPI. It creates only missing integration files, adds missing env placeholders, prints required manual wiring, then runs doctor. It never overwrites an existing file and never edits `next.config.*` or `main.py`.

## `doctor`

```bash
npx @mythos-work/sdk doctor
python -m mythos_sdk doctor
```

Doctor reads process environment over `.env.local`, then `.env`, and performs these checks in order:

| Check | Failure or warning fix |
|---|---|
| `MYTHOS_SESSION_SECRET` is set | `Set MYTHOS_SESSION_SECRET (≥32 chars): openssl rand -base64 32` |
| Express/FastAPI config is not only in `.env` | Warning: `MYTHOS_* found only in .env — make sure your start command loads it (node --env-file=.env … / uvicorn --env-file .env)`. Next.js loads `.env` itself, so it never gets this warning. |
| Secret length is at least 32 | `MYTHOS_SESSION_SECRET is N chars; regenerate with openssl rand -base64 32 (and update your host's env, e.g. Vercel)` |
| `MYTHOS_LISTING_ID` or `MYTHOS_LISTING_IDS` has an ID | Warning: `MYTHOS_LISTING_ID not set — fine only if your code passes resolveListingIds to createMythos()` |
| `MYTHOS_API_URL` is an HTTP(S) URL | `MYTHOS_API_URL must be an http(s) URL` |
| Mythos API JWKS is reachable | `Cannot reach {api} (<status or error>). Check MYTHOS_API_URL / network.` |
| Every configured listing exists and is published | `Listing {id} not found or not published on {api}. Check the ID and that the listing is published.` Other failures report `run-info returned {status}`. |
| Framework route is wired | `Missing Mythos route. Run: npx @mythos-work/sdk init` |
| Next.js well-known rewrites exist | `Add the /.well-known rewrites to next.config (see https://docs.mythos.work/getting-started/quickstart-nextjs-app)` |
| Node SDK version is at least 0.2.0 | `Upgrade: npm i @mythos-work/sdk@latest` |

Python doctor performs the first six checks. A listing ID warning does not fail the command because dynamic listing resolution may provide IDs at runtime.

## `agents`

```bash
npx @mythos-work/sdk agents
```

Installs the `integrate-mythos-sdk` skill for Claude Code (`.claude/skills`), Codex and Devin (`.agents/skills`) and Cursor (`.cursor/skills`), and adds a short `<!-- mythos-sdk -->` section to the root `AGENTS.md` (read by Codex and Devin). It never overwrites existing files and appends the `AGENTS.md` section only once. See [Use with AI agents](/ai-agents).

## What doctor cannot check

Doctor cannot detect a backend missing an LLM identity key because that failure only appears when a session is consumed. The SDK logs it as `[mythos] session: consume returned no LLM identity token`.
