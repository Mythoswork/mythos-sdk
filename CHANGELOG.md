# Changelog

## 0.5.0

### Added
- Producer binding via `MYTHOS_KEY`: launch, handshake and listing callback tokens must carry the matching `pkh` when a key is configured.
- Node and Python export `ProducerMismatchError` (`PRODUCER_MISMATCH`, HTTP 401), a subclass of `InvalidLaunchTokenError`.
- Startup rejects malformed keys; doctor reports set, malformed and missing keys; init includes a dashboard key placeholder.

### Migration
- Missing keys remain a soft warning in 0.5.0 for auto-registration, dynamic launches, handshake and callback validation (once per process). Static `MYTHOS_LISTING_ID(S)` launch validation remains silent without a key.
- `MYTHOS_KEY` will be required in 0.6.0. Copy it from Dashboard → Settings → Mythos key and redeploy. See [MIGRATION.md](MIGRATION.md).
- Deploy backend P1 first; then publish SDK 0.5.0 to npm and PyPI, then update apps and frontend.

## 0.4.1

### Fixed
- The npm and PyPI package pages (READMEs) and the Express/FastAPI quickstarts still showed `0.3.0` install commands and a `@0.3.0` CDN script, which was never published. Install commands are now unpinned, and the CDN script uses `@0.4` (latest 0.4.x). No code changes.

## 0.4.0

First published release since **0.1.0 on npm** and **0.0.8 on PyPI**. It also ships everything in the unpublished 0.1.1, 0.2.0 and 0.3.0 entries below, so read them too when upgrading.

### Added
- Consumed launch sessions last up to 8 hours; identity tokens refresh silently at the session route and inline for `llm()` calls.
- Embedded browser clients automatically request a relaunch at hard expiry (`autoRelaunch: false` opts out).
- Node and Python sealed sessions share the `v1.` cookie format and can open each other's cookies when configured with the same secret; a shared conformance suite verifies parity.

### Migration
- Existing pre-v1 cookies require one relaunch after upgrade. See [MIGRATION.md](MIGRATION.md).

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
