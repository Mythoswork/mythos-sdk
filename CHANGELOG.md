# Changelog

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
