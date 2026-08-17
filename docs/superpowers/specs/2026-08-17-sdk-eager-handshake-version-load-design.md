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

## Scope

- `packages/node/src/handshake.ts` — defer the `express` value import to
  call time.
- `packages/node/src/version.ts` — stop doing a runtime fs read; source
  `SDK_VERSION` as a build-time-generated literal instead.
- `packages/node/scripts/generate-version.js` (new) — the generator.
- `packages/node/package.json` — wire the generator into `prebuild`/`pretest`.
- `.gitignore` — stop tracking the generated `src/version.ts`.
- New regression tests proving both fixes and guarding against
  reintroduction.

Out of scope: `packages/python`. The Jira ticket is scoped to
`@mythos-work/sdk` (Node) specifically, so the fix here stays there. Worth
flagging for a separate ticket: `mythos_sdk/__init__.py` has the same
eager-unconditional-barrel-import shape — it unconditionally imports
`create_handshake_router`/`handshake_router` from `.handshake`, which does
`from fastapi import APIRouter, Request` at module level even though
`fastapi` is an `[project.optional-dependencies]` extra, not a base
dependency (`pyproject.toml:10,27` vs. base `dependencies` at line 21-24
which only lists `python-jose`/`httpx`). A `verify_launch_token`-only
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

`src/version.ts` becomes a generated artifact — same category as `dist/`,
which this package already gitignores. It is removed from git tracking and
added to `.gitignore`. Every path that consumes it (`npm run build` for
`tsc`, `npm test` for `ts-jest`, which reads `src/*.ts` directly) regenerates
it first via the lifecycle hook, so there's no drift window in CI or in the
standard `npm test`/`npm run build` local workflow. (Running `npx jest`
directly, bypassing the npm lifecycle, requires `src/version.ts` to already
exist on disk — same precondition this package already has for `dist/`,
which requires `npm run build` first. Not a new footgun class, just the
existing one extended to one more generated file.)

Compiled output becomes `exports.SDK_VERSION = '0.0.6';` — a plain literal,
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

- No exported symbol is added, removed, or changes signature.
- No `package.json` `exports`/`main`/`types` field changes.
- `SDK_VERSION`'s value is unchanged (still equals `package.json`'s
  `version` field) — only *how* it's produced changes, from a runtime read
  to a build-time-generated literal.
- Ships as a patch version bump.

## Testing

New regression coverage in `packages/node/tests/`:

1. **`no-eager-express.test.ts`** — mocks `express` with a factory that
   throws, then asserts `require('../src/index')` and `require('../src/verify')`
   do **not** throw. This fails today (throws, because `index.ts` eagerly
   pulls in `handshake.ts` which eagerly requires `express`) and passes once
   the `Router` import moves inside `handshakeRoute()`.

2. **`generate-version.test.ts`** —
   - Runs `scripts/generate-version.js` and asserts the written
     `src/version.ts` contains `SDK_VERSION` matching `package.json`'s
     `version` field.
   - Asserts `src/version.ts`'s contents contain no `createRequire` or
     `require(` — a permanent guard against reintroducing the runtime fs
     read.

3. **Existing `handshake.test.ts`** (8 tests, unchanged) must continue to
   pass unmodified — they exercise `handshakeRoute()` actually being called
   with a real `express` `Router`, proving the lazy require still works
   correctly for consumers who do use it.

Full command: `npm run build && npm test` in `packages/node/` (matches
`.github/workflows/ci.yml`'s existing `node` job — no CI config changes
needed).

## Docs

One-line correction to `docs-site/docs/guides/watch-out-for.md`'s "Also
worth knowing" section, which currently claims `sdk_version` is "a hardcoded
string in both SDKs, not read from the installed package version." That's
stale for both: Node stopped hardcoding it in `fad3aed` (runtime
`createRequire` read, now becoming a build-time literal per this spec), and
Python was never hardcoded — `version.py` calls
`importlib.metadata.version("mythos-sdk")` with a fallback string. Rewrite
the note to state Node's actual current mechanism (build-time-generated
literal, matching `package.json`) and Python's (`importlib.metadata`
lookup), dropping the "hardcoded in both" claim entirely.
