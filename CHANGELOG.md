# Changelog

## 0.3.0

### Added
- `npx @mythos-work/sdk init` and `doctor` CLI
- `python -m mythos_sdk doctor`
- `@mythos-work/sdk/express` adapter with `mythosExpress`
- Bundled `AGENTS.md` in the npm package and Python wheel
- `npx @mythos-work/sdk agents` installs the `integrate-mythos-sdk` skill for Claude Code (`.claude/skills`), Codex and Devin (`.agents/skills` + root `AGENTS.md`) and Cursor (`.cursor/skills`)
- `doctor` warns when Express/FastAPI config exists only in `.env` (those servers don't load it automatically)

### Changed
- `m.confirmCharge({ kind: 'llm', reason })` no longer takes `credits` — LLM cost is usage-based. The legacy positional `confirmCharge()` is unchanged
- `mythos.llm<OpenAI>(req, …)` now returns `Promise<OpenAI>` (the caller's client type) instead of a `SdkOpenAI | TFallback` union, fixing "expression is not callable" in ESM/bundler projects where `openai`'s CJS and ESM typings differ

### Documentation
- Rewrote the docs site around `createMythos()` and generated `llms.txt` / `llms-full.txt`

## 0.2.0

### Added
- `initMythos()` browser client with session bootstrap, automatic handshake, cookie-first transport with a one-time probe, `m.fetch`, `m.confirmCharge` returning `{ approved, consentId? }`, and `m.relaunch()`
- `@mythos-work/sdk/react` SSR-safe `useMythos()` hook
- `dist/mythos-client.global.js` script build exposing the global `Mythos` API
- `./package.json` export

### Changed
- Python session route moved to `/api/mythos/session` to match Node.js

## 0.1.1

### Added
- High-level `createMythos()` / `create_mythos()` APIs for sessions, charges, LLM access and billing metadata
- Web-standard Node handlers, a Next.js Pages Router adapter, and a FastAPI router
- Encrypted session cookies with explicit expiry, cookie/header session transport, and launch-token reuse
- Typed HTTP errors, meter results, and `[mythos]` diagnostic logging
- 0.0.x → 0.1.1 migration guide

## 0.1.0

### Added
- Launch token verification (ES256 + JWKS)
- `requireLaunchToken` / `require_launch_token` with mandatory `/consume`
- `reportUsage` / `report_usage` metering with optional idempotency key
- Handshake endpoint for platform health checks
- Integration guide and expanded README

### Fixed
- Node audience validation now checks all `aud` elements (parity with Python)
- JWKS cache keyed per API URL
- Required JWT claims validated before session creation
- Config errors return 500 instead of masquerading as 401
- Python missing `lt` returns 401 (not 422)
- URL encoding for `jti` in API paths
- Credits must be positive integers
- Removed `console.error` from Node handshake handler

### Changed
- New error types: `MythosConfigError`, `InvalidLaunchTokenError`, `InvalidUsageError`
- npm package publishes `dist/` only
- Python package includes `py.typed` and PyPI metadata
