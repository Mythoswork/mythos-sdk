# Lazy-load handshakeRoute's express + version dependencies

Jira: Mythos SDK versioning — "Real bug in @mythos-work/sdk itself: dist/version.js
reads its own package.json via createRequire(__filename) at module-load time,
and since index.js unconditionally re-exports handshakeRoute (which imports
version.js), any import from the package — even just verifyLaunchToken —
pulls that in."

## Problem

`packages/node/src/index.ts` unconditionally re-exports `handshakeRoute`:

```ts
export { handshakeRoute } from './handshake';
```

tsc compiles this (target `CommonJS`, per `tsconfig.json`) to an eager,
unconditional `require("./handshake")` at the top of `index.js`. CommonJS
requires execute a module's full top-level body the moment they run — ESM
named-export syntax reads as lazy, but the compiled output isn't. There is no
bundling/tree-shaking step in this package's own build (`tsc` only, one
output file per source file), so nothing removes the unused branch.

That means `const { verifyLaunchToken } = require('@mythos-work/sdk')` also
executes `handshake.ts`'s full module body, which does two things at
module-eval time that a `verifyLaunchToken`-only consumer never asked for:

1. **`import { Router } from 'express'`** (`handshake.ts:2`) — a real value
   import, compiled to `require('express')`. Every other file in this
   package that touches Express only does `import type {...}`
   (`middleware.ts:1`, `listing-callback.ts:2`), which erases at compile
   time and costs nothing at runtime. `handshake.ts` is the only file that
   turns `express` — a `peerDependency`, not a real dependency, with no
   `peerDependenciesMeta.optional` — into a hard load-time require for every
   consumer of the package, not just consumers of `handshakeRoute`.

2. **`import { SDK_VERSION } from './version'`** (`handshake.ts:6`) →
   `version.ts`:

   ```ts
   import { createRequire } from 'module';
   const nodeRequire = createRequire(__filename);
   export const SDK_VERSION: string = nodeRequire('../package.json').version;
   ```

   This runs at module-eval time (not inside a function, not deferred) and
   does a synchronous filesystem read through `createRequire`, on every
   import of the package.

### Why this actually breaks things, not just "wasteful"

- **Forced peer dependency.** `verifyLaunchToken` itself has zero Express
  dependency (`verify.ts` imports only `jose`, `jwks-cache`, `config`,
  `errors`, `types`). A consumer who installs `@mythos-work/sdk` to call
  `verifyLaunchToken` in a non-Express context (e.g. a bare Lambda handler)
  and does not have `express` installed gets `Cannot find module 'express'`
  on import — from code they never call. This repo's own test suite
  currently only works because npm auto-installs peer dependencies by
  default (`express@5.2.1` sits in `packages/node/node_modules/` despite no
  `devDependency` entry for it) — that auto-install behavior is exactly what
  masks this for us and won't hold for every consumer's package manager
  config (pnpm strict mode, Yarn PnP, or an explicit peer-dep opt-out).

- **Bundler-blind fs read.** `nodeRequire('../package.json')` is a require
  reached through a renamed variable, not the literal token
  `require(...)`/`import`. Static dependency tracers that bundlers and
  serverless platforms use to decide which files ship (`@vercel/nft`,
  webpack, Next.js `output: 'standalone'`) pattern-match on the literal
  syntax to build their file graph. A require reached via `createRequire()`
  is invisible to that walk, so `package.json` doesn't get traced into the
  deployed closure — `MODULE_NOT_FOUND: ../package.json` at cold start on
  Vercel/Next serverless functions. Edge runtimes (no filesystem, no
  `__filename` under forced ESM) fail even harder, just from importing the
  package.

Both failure modes are downstream of the same root cause: `index.ts`'s eager
barrel export turns "import one named export" into "eagerly execute every
export's module graph, including disk reads and optional-peer-dependency
loads."

### Third instance of the same bug class: `http.ts`'s frozen `apiUrl`

`http.ts:5` does the same thing with environment configuration:

```ts
import { loadConfig } from './config';

export const MYTHOS_HTTP_TIMEOUT_MS = 5_000;

const { apiUrl } = loadConfig();          // module top level — runs once, at first import

export function mythosRequest(url: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiUrl}${url}`, { ...init, signal: AbortSignal.timeout(MYTHOS_HTTP_TIMEOUT_MS) });
}
```

`loadConfig()` reads `process.env.MYTHOS_API_URL` (`config.ts:6`). Calling
it at module scope snapshots that value **once**, at first import of
`http.ts` — and `http.ts` is on every consumer's critical path
(`verify.ts` → `jwks-cache.ts` → `http.ts`), so this fires for everyone,
including the `verifyLaunchToken`-only consumer.

Any `MYTHOS_API_URL` set *after* that first import is silently ignored and
traffic goes to the default production URL instead. That ordering isn't
exotic — it's the normal case for `dotenv` loaded after imports, for
serverless runtimes that inject environment after module init, and for test
setup that sets env in a `beforeEach`. Nothing errors; requests just quietly
go to the wrong environment.

**Consequence: the per-URL JWKS cache keying is dead code.** `mythosRequest`
takes no `apiUrl` parameter and always uses the frozen module-scope value.
But `jwks-cache.ts` threads an `apiUrl` argument through
`getKeySet(apiUrl)` → `fetchJwks(apiUrl)` and uses it *only* as the `_cache`
key (`_cache.get(apiUrl)` / `_cache.set(apiUrl, ...)`), then calls
`mythosRequest('/.well-known/jwks.json', { method: 'GET' })` without passing
it. The argument never reaches the network call.

That makes a real correctness bug reachable today: `handshake.ts:11`
re-reads `process.env.MYTHOS_API_URL` per request (fresh) and passes the
result to `getKeySet(apiUrl)`. If the env value changed since first import,
that's a cache **miss** under the new key, so the SDK refetches — from the
**old** frozen URL — and stores the old environment's keys under the new
environment's cache key. Handshake tokens then validate against the wrong
environment's keys, with no error surfaced. The "JWKS cache keyed per API
URL" entry in CHANGELOG 0.1.0 is effectively vestigial.

Note this failure mode is *staleness*, not a crash: `loadConfig()` itself is
pure and cannot throw, so unlike the `express` and `createRequire` cases it
never breaks an import outright — which is exactly why it has gone unnoticed.
Same root cause wearing a third hat (work done at module-eval time that
belongs at call time), so it's fixed here rather than deferred to its own
ticket.

## Scope

- `packages/node/src/handshake.ts` — defer the `express` value import to
  call time.
- `packages/node/src/version.ts` — stop doing a runtime fs read; source
  `SDK_VERSION` as a build-time-generated literal instead.
- `packages/node/scripts/generate-version.js` (new) — the generator.
- `packages/node/package.json` — wire the generator into `prebuild`/`pretest`.
- `packages/node/src/http.ts` — move the `loadConfig()` call off module
  scope and let callers pass an explicit `apiUrl`.
- `packages/node/src/jwks-cache.ts` — pass its already-threaded `apiUrl`
  through to `mythosRequest` so the cache key and the fetch target agree.
- New regression tests proving all three fixes and guarding against
  reintroduction.

Out of scope: `packages/python`. The Jira ticket is scoped to
`@mythos-work/sdk` (Node) specifically, so the fix here stays there. Worth
flagging for a separate ticket: `mythos_sdk/__init__.py` has the same
eager-unconditional-barrel-import shape — it unconditionally imports
`create_handshake_router`/`handshake_router` from `.handshake`, which does
`from fastapi import APIRouter, Request` at module level even though
`fastapi` is an `[project.optional-dependencies]` extra
(`pyproject.toml:26-27`), not a base dependency (base `[project]
dependencies` at lines 21-24 lists only `python-jose`/`httpx`). Note
`pyproject.toml:10` also mentions `fastapi[standard]`, but that entry is
inside `[dependency-groups].dev` — a PEP 735 dependency group for local/CI
tooling, a different mechanism from pip extras, and not evidence about what
consumers get. It is, however, why the Python test suite passes today
despite the bug. A `verify_launch_token`-only
consumer who didn't install the `fastapi` extra gets `ImportError` on
`import mythos_sdk` — same failure-mode-A shape as the Node bug, and
arguably worse: `handshake.py:54` does `handshake_router =
create_handshake_router()` at module level, building the router as an eager
side effect with no call required at all. Python's version sourcing itself
(`version.py`: `importlib.metadata.version("mythos-sdk")`, with a
try/except fallback) doesn't share failure-mode-B — it's a standard
packaging-metadata API call, not a relative-path fs read — so only the
Node side needs the build-time-literal treatment in this spec. Also out of
scope: restructuring the package's export surface into subpaths (e.g.
`@mythos-work/sdk/express`) — considered and rejected below.

## Design

### 1. `SDK_VERSION`: build-time literal, not runtime fs read

Replace the `createRequire` read with a small generator script that runs
before `tsc` and before `jest`, and writes a plain literal to
`src/version.ts`:

```js
// packages/node/scripts/generate-version.js
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const outPath = path.join(__dirname, '..', 'src', 'version.ts');
const contents =
  '// Generated by scripts/generate-version.js — do not edit by hand.\n' +
  `export const SDK_VERSION = ${JSON.stringify(pkg.version)};\n`;

fs.writeFileSync(outPath, contents);
```

`package.json` gets two lifecycle hooks (npm runs `pre<script>`
automatically, no extra wiring needed):

```json
"scripts": {
  "prebuild": "node scripts/generate-version.js",
  "build": "tsc",
  "pretest": "node scripts/generate-version.js",
  "test": "jest",
  "prepublishOnly": "npm run build"
}
```

**`src/version.ts` stays tracked in git** — generated, but committed, not
gitignored. This is deliberate and worth spelling out, because the obvious
instinct ("it's generated, so gitignore it like `dist/`") is wrong here and
breaks the repo:

`handshake.ts:6` imports `./version`, and `index.ts` re-exports
`handshake.ts`, both inside `tsconfig.json`'s `"include": ["src"]` /
`"rootDir": "./src"`. If `src/version.ts` is absent from a fresh clone,
**`tsc` itself fails** — `error TS2307: Cannot find module './version'` —
and so does `tsc --noEmit`, and so does the IDE's TypeScript server the
moment anyone opens the repo. That's categorically worse than `dist/`'s
absence, which only affects package *consumers* and never blocks compiling
`src/`. Gitignoring the file would mean a fresh clone doesn't typecheck
until someone happens to run an npm lifecycle script first.

Keeping it tracked costs nothing and removes the failure mode entirely: a
fresh clone typechecks immediately, and `prebuild`/`pretest` overwrite the
file before every build and every test run, so the committed value can never
reach a published artifact stale (`prepublishOnly` → `build` → `prebuild`
regenerates it). If a version bump lands without a rebuild, the diff simply
shows up in the next build — visible and self-correcting, rather than a
broken checkout.

The file gets a `// Generated by scripts/generate-version.js — do not edit
by hand.` header so its provenance is obvious in review.

Compiled output becomes `exports.SDK_VERSION = '0.0.7';` (whatever
`package.json`'s `version` field holds at build time) — a plain literal,
identical in shape and runtime cost to the pre-`fad3aed` hardcoded string,
just auto-synced to `package.json` at build time instead of hand-edited.
Zero runtime fs access, zero bundler-tracing dependency, works unchanged on
edge runtimes.

### 2. `handshakeRoute`: defer the `express` require to call time

```ts
// handshake.ts
import { jwtVerify, errors } from 'jose';
import type { Router as ExpressRouter, Request, Response } from 'express';
import { getKeySet, getKeySetWithKidFallback } from './jwks-cache';
import { extractLaunchToken } from './query';
import { SDK_VERSION } from './version';

// ...validateHandshakeToken unchanged...

export function handshakeRoute(): ExpressRouter {
  const { Router } = require('express') as typeof import('express');
  const router = Router();

  router.get('/.well-known/mythos-handshake', async (req: Request, res: Response) => {
    // ...unchanged...
  });

  return router;
}
```

`import type` erases completely at compile time (no runtime cost, matches
the existing pattern in `middleware.ts`/`listing-callback.ts`). The `Router`
value binding moves inside the function body, so `express` is only
`require`'d the first time someone actually calls `handshakeRoute()` — a
consumer who never calls it (including one who only imports
`verifyLaunchToken`) never triggers a load of `express` at all. Signature
stays synchronous (`(): ExpressRouter`, not `Promise<ExpressRouter>`) — no
public API change, no consumer-visible behavior change for existing
`handshakeRoute()` callers. `require` inside a CommonJS-targeted file is
ordinary Node; this file already assumes a Node/Express runtime.

### 3. `http.ts`: read config per call, let callers pass an explicit `apiUrl`

```ts
// http.ts
import { loadConfig } from './config';

export const MYTHOS_HTTP_TIMEOUT_MS = 5_000;

export function mythosRequest(
  url: string,
  init?: RequestInit,
  apiUrl?: string,
): Promise<Response> {
  const base = apiUrl ?? loadConfig().apiUrl;
  return fetch(`${base}${url}`, { ...init, signal: AbortSignal.timeout(MYTHOS_HTTP_TIMEOUT_MS) });
}
```

The module-scope `const { apiUrl } = loadConfig();` is deleted. `loadConfig()`
only reads `process.env` and builds a small object — cheap enough to call per
request, and calling it per request is the entire point: `MYTHOS_API_URL` set
after import is now honored.

`jwks-cache.ts`'s `fetchJwks` passes the `apiUrl` it already has, closing the
cache-key/fetch-target divergence:

```ts
// jwks-cache.ts — fetchJwks
const res = await mythosRequest('/.well-known/jwks.json', { method: 'GET' }, apiUrl);
```

`api-client.ts` is unchanged — it has no `apiUrl` in hand and doesn't want
one, so it takes the `loadConfig()` default and now correctly picks up
late-set environment on every call.

The new third parameter is optional and appended, so it's source-compatible
with both existing call sites. `mythosRequest` is internal (not re-exported
from `index.ts`), so this is not a public API change either way.

### Alternative considered and rejected: subpath export split

Move `handshakeRoute` behind a new `@mythos-work/sdk/express` entry point,
keeping `@mythos-work/sdk`'s core module graph free of `express` entirely.
Structurally the cleaner long-term isolation (no eager-require footgun
possible at all, by construction), but it's a breaking change: every current
`import { handshakeRoute } from '@mythos-work/sdk'` call site breaks,
requiring a semver-major bump and doc updates across the quickstart,
Express, Next.js, and Vercel serverless guides. Rejected for this fix
because the ticket describes a bug to fix, not an API redesign — the
lazy-load approach above closes both failure modes with no consumer-visible
change and ships as a patch release.

## Backward compatibility

- No exported symbol is added, removed, or changes signature. `mythosRequest`
  gains an optional appended third parameter, but it is internal — not
  re-exported from `index.ts`.
- No `package.json` `exports`/`main`/`types` field changes.
- `SDK_VERSION`'s value is unchanged (still equals `package.json`'s
  `version` field) — only *how* it's produced changes, from a runtime read
  to a build-time-generated literal.
- `MYTHOS_API_URL` resolution changes from "snapshotted at first import" to
  "read per call." For any consumer who set the variable before importing
  the SDK — the documented, intended usage — behavior is identical. Only
  consumers who were silently getting the *wrong* URL see a change, and the
  change is that they now get the right one.
- Ships as a patch version bump.

## Testing

New regression coverage in `packages/node/tests/`:

1. **`no-eager-express.test.ts`** — mocks `express` with a factory that
   throws, then asserts `require('../src/index')` does **not** throw, and
   that `verifyLaunchToken` is reachable off the resulting module object.
   This fails today (throws, because `index.ts` eagerly pulls in
   `handshake.ts`, which eagerly requires `express`) and passes once the
   `Router` import moves inside `handshakeRoute()`.

   Note the test must go through `index.ts` — the barrel — to exercise the
   bug. Asserting on `require('../src/verify')` directly would prove
   nothing: `verify.ts`'s import graph (`jose`, `./jwks-cache` → `./http` →
   `./config`, `./errors`, `./types`) never references `express` even
   today, so such a test passes identically before and after the fix.

2. **`generate-version.test.ts`** —
   - Runs `scripts/generate-version.js` and asserts the written
     `src/version.ts` contains `SDK_VERSION` matching `package.json`'s
     `version` field.
   - Asserts `src/version.ts`'s contents contain no `createRequire` or
     `require(` — a permanent guard against reintroducing the runtime fs
     read.

3. **`http-config.test.ts`** —
   - Sets `process.env.MYTHOS_API_URL` **after** importing `http.ts`, calls
     `mythosRequest`, and asserts `fetch` was called against the newly-set
     URL. Fails today (the frozen module-scope snapshot wins), passes once
     `loadConfig()` moves inside the function.
   - Asserts an explicitly-passed `apiUrl` third argument wins over the
     environment, covering the `jwks-cache.ts` path.

4. **Existing `handshake.test.ts`** (8 tests), **`http.test.ts`**, and
   **`jwks-cache.test.ts`** must continue to pass unmodified.
   `handshake.test.ts` exercises `handshakeRoute()` actually being called
   with a real `express` `Router`, proving the lazy require still resolves
   for consumers who do use it. `http.test.ts` already asserts
   `mythosRequest` prepends the default `https://api.mythos.work` — that
   assertion holds under per-call `loadConfig()` since the test leaves
   `MYTHOS_API_URL` unset.

Full command: `npm run build && npm test` in `packages/node/` (matches
`.github/workflows/ci.yml`'s existing `node` job — no CI config changes
needed).

## Docs

`docs-site/docs/guides/watch-out-for.md`'s "Also worth knowing" section has
two stale bullets, both corrected here.

**`sdk_version` sourcing.** It currently claims `sdk_version` is "a
hardcoded string in both SDKs, not read from the installed package version."
Stale for both: Node stopped hardcoding it in `fad3aed` (runtime
`createRequire` read, now becoming a build-time literal per this spec), and
Python was never hardcoded — `version.py` calls
`importlib.metadata.version("mythos-sdk")` with a fallback string. Rewrite
to state Node's actual mechanism (build-time-generated literal, matching
`package.json`) and Python's (`importlib.metadata` lookup), dropping the
"hardcoded in both" claim.

**JWKS cache keying.** It currently claims the keyset "isn't keyed by
`MYTHOS_API_URL`." Also stale — `jwks-cache.ts` has keyed `_cache` by
`apiUrl` since 0.1.0. The *symptom* the bullet describes (a long-running
process that switches API URLs keeps validating against the previous
environment's keys) was nevertheless real, because of the `http.ts` bug this
spec fixes: the cache key was per-URL but the fetch always hit the frozen
module-scope URL. Once this spec's fix lands, both the keying and the fetch
target agree and the symptom is gone, so the bullet should be removed
rather than reworded — keeping a "watch out for" note about a fixed bug
would mislead.
