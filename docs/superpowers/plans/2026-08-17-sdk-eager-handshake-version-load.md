# SDK Eager Handshake/Version Load Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `import { verifyLaunchToken } from '@mythos-work/sdk'` (or any
other single named import) from eagerly requiring `express` and doing a
runtime `package.json` filesystem read, by deferring both to the point
they're actually needed.

**Architecture:** Three independent, additive fixes in `packages/node/src/`,
all instances of the same root cause — work done at module-eval time that
belongs at call/build time. (1) `SDK_VERSION` moves from a runtime
`createRequire(__filename)` read to a build-time-generated literal, written
by a new script wired into `prebuild`/`pretest`. (2) `handshakeRoute`'s
`express` `Router` import moves from module top-level (eager) to inside the
function body (lazy, call-time only). (3) `http.ts`'s module-scope
`loadConfig()` call moves inside `mythosRequest`, which also gains an
optional explicit `apiUrl` so `jwks-cache.ts`'s cache key and its fetch
target stop diverging. None changes any exported symbol, signature, or
`package.json` `exports` field — ships as a patch release.

**Tech Stack:** TypeScript (`tsc`, CommonJS target), Jest + ts-jest, plain
Node.js script (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-08-17-sdk-eager-handshake-version-load-design.md`

## Global Constraints

- No exported symbol added, removed, or changed in signature — `handshakeRoute(): Router` stays synchronous, `SDK_VERSION: string` stays a plain string export. `mythosRequest` may gain an optional appended parameter (it is internal, not re-exported from `index.ts`).
- No `packages/node/package.json` `exports`/`main`/`types` field changes.
- No new runtime dependencies. `express` stays a `peerDependency`.
- `SDK_VERSION`'s value must remain exactly `package.json`'s `version` field — only the sourcing mechanism changes.
- `packages/node/src/version.ts` stays **tracked in git**. Do NOT gitignore it: `handshake.ts` imports it and it sits inside `tsconfig.json`'s `"include": ["src"]`, so its absence breaks `tsc`, `tsc --noEmit`, and the IDE TypeScript server on a fresh clone. It is generated *and* committed.
- No `.github/workflows/ci.yml` changes — the existing `npm run build` then `npm test` sequence must keep working unmodified.
- Verify everything with `npm run build && npm test` from `packages/node/` (matches CI's `node` job exactly).
- Run single test files as `npm test -- <path>`, never bare `npx jest <path>`. Once Task 1 wires the `pretest` hook, `npx jest` bypasses it and skips regenerating `src/version.ts`. The one deliberate exception is Task 1 Step 2, which runs before the hook exists — it is flagged inline. This matters most under the recommended per-task subagent/worktree execution, where a task may start from a checkout that hasn't run any npm lifecycle script.
- `packages/python` is untouched — out of scope per spec.

---

### Task 1: Build-time `SDK_VERSION` generation

**Files:**
- Create: `packages/node/scripts/generate-version.js`
- Modify: `packages/node/package.json:26-30` (scripts block)
- Modify: `packages/node/src/version.ts` (content replaced by generated output; stays tracked in git)
- Test: `packages/node/tests/generate-version.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `src/version.ts` exporting `SDK_VERSION: string` (same name/type as today) — Task 2's `handshake.ts` continues to `import { SDK_VERSION } from './version'` unchanged, and `tests/handshake.test.ts:5`'s existing `import { SDK_VERSION } from '../src/version'` keeps working unmodified.

- [ ] **Step 1: Write the failing test**

Create `packages/node/tests/generate-version.test.ts`:

```ts
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PKG_ROOT = path.join(__dirname, '..');
const SCRIPT_PATH = path.join(PKG_ROOT, 'scripts', 'generate-version.js');
const VERSION_TS_PATH = path.join(PKG_ROOT, 'src', 'version.ts');

test('generate-version.js writes SDK_VERSION matching package.json', () => {
  execFileSync('node', [SCRIPT_PATH]);

  const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
  const versionSrc = fs.readFileSync(VERSION_TS_PATH, 'utf8');

  expect(versionSrc).toContain(`export const SDK_VERSION = ${JSON.stringify(pkg.version)};`);
});

test('version.ts performs no runtime package.json read', () => {
  const versionSrc = fs.readFileSync(VERSION_TS_PATH, 'utf8');

  expect(versionSrc).not.toMatch(/createRequire/);
  expect(versionSrc).not.toMatch(/require\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/node && npx jest tests/generate-version.test.ts`

`npx jest` (not `npm test`) is correct **at this step only** — the
`pretest` hook doesn't exist yet (Step 4 adds it), and once it does it would
invoke the generator script that Step 3 hasn't written yet. Every later
single-file run in this plan uses `npm test --` so the hook fires.

Expected: FAIL — first test fails because `scripts/generate-version.js`
doesn't exist yet (`ENOENT`); second test fails because the current
`src/version.ts` still contains `createRequire`.

- [ ] **Step 3: Write the generator script**

Create `packages/node/scripts/generate-version.js`:

```js
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

- [ ] **Step 4: Wire the generator into `prebuild`/`pretest`**

In `packages/node/package.json`, current scripts block:

```json
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "prepublishOnly": "npm run build"
  },
```

Replace with:

```json
  "scripts": {
    "prebuild": "node scripts/generate-version.js",
    "build": "tsc",
    "pretest": "node scripts/generate-version.js",
    "test": "jest",
    "prepublishOnly": "npm run build"
  },
```

(npm runs `pre<name>` automatically before `<name>` — no separate wiring
needed.)

- [ ] **Step 5: Generate the file and confirm its new contents**

Run: `cd packages/node && node scripts/generate-version.js`

Then read `packages/node/src/version.ts`. Expected contents, exactly:

```ts
// Generated by scripts/generate-version.js — do not edit by hand.
export const SDK_VERSION = "0.0.7";
```

The version string is whatever `package.json`'s `version` field holds —
`0.0.7` as of this plan's base commit (`35e3790`). If it has been bumped
since, expect the current value, not this literal. A mismatch here means the
package was bumped, not that the generator is broken.

**Do not gitignore this file, and do not `git rm --cached` it.** It is
generated *and* committed. `handshake.ts:6` imports `./version`, and the
file sits inside `tsconfig.json`'s `"include": ["src"]` / `"rootDir":
"./src"` — so if it is missing from a fresh clone, `tsc` fails outright with
`error TS2307: Cannot find module './version'`, as do `tsc --noEmit` and the
IDE TypeScript server. Keeping it tracked costs nothing and
`prebuild`/`pretest` overwrite it before every build and test, so a stale
committed value can never reach a published artifact.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/node && npm test -- tests/generate-version.test.ts`

Expected: PASS (both tests).

- [ ] **Step 7: Run the full existing suite to confirm no regression**

Run: `cd packages/node && npm run build && npm test`

Expected: all existing tests pass, including `tests/handshake.test.ts`'s
`sdk_version: SDK_VERSION` assertions (unaffected — they compare against the
same imported binding, not a hardcoded literal).

- [ ] **Step 8: Commit**

```bash
git add packages/node/scripts/generate-version.js packages/node/package.json \
  packages/node/src/version.ts packages/node/tests/generate-version.test.ts
git commit -m "fix(sdk): generate SDK_VERSION at build time instead of runtime fs read"
```

---

### Task 2: Lazy-load `express` in `handshakeRoute`

**Files:**
- Modify: `packages/node/src/handshake.ts:1-6` (imports), `:33-34` (function body)
- Test: `packages/node/tests/no-eager-express.test.ts`

**Interfaces:**
- Consumes: `SDK_VERSION` from Task 1's `./version` (already-working import, unchanged).
- Produces: `handshakeRoute(): Router` — same exported name, same synchronous signature, same runtime behavior for callers. No other task depends on this one's internals.

- [ ] **Step 1: Write the failing test**

Create `packages/node/tests/no-eager-express.test.ts`:

```ts
jest.mock('express', () => {
  throw new Error('express must not be required merely by importing the SDK');
});

test('importing the package entrypoint does not eagerly require express', () => {
  expect(() => require('../src/index')).not.toThrow();
});

test('verifyLaunchToken is reachable from the entrypoint without express', () => {
  const sdk = require('../src/index');
  expect(typeof sdk.verifyLaunchToken).toBe('function');
});
```

Both tests must go through `../src/index` — the barrel — because that is
where the bug lives. Do **not** write this test against `../src/verify`
directly: `verify.ts`'s import graph (`jose`, `./jwks-cache` → `./http` →
`./config`, `./errors`, `./types`) contains no reference to `express` or
`./handshake` even today, so such a test would pass identically before and
after the fix and prove nothing.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/node && npm test -- tests/no-eager-express.test.ts`

Expected: FAIL — both tests throw
`'express must not be required merely by importing the SDK'` at the
`require('../src/index')` call, because `index.ts` unconditionally requires
`handshake.ts`, which currently requires `express` at module top-level. (The
second test fails at its own `require` line, before reaching the
`typeof` assertion.)

- [ ] **Step 3: Move the `express` value import inside the function**

Current `packages/node/src/handshake.ts:1-6`:

```ts
import { jwtVerify, errors } from 'jose';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { getKeySet, getKeySetWithKidFallback } from './jwks-cache';
import { extractLaunchToken } from './query';
import { SDK_VERSION } from './version';
```

Replace with:

```ts
import { jwtVerify, errors } from 'jose';
import type { Router as ExpressRouter, Request, Response } from 'express';
import { getKeySet, getKeySetWithKidFallback } from './jwks-cache';
import { extractLaunchToken } from './query';
import { SDK_VERSION } from './version';
```

Current `packages/node/src/handshake.ts:33-35`:

```ts
export function handshakeRoute(): Router {
  const router = Router();

```

Replace with:

```ts
export function handshakeRoute(): ExpressRouter {
  const { Router } = require('express') as typeof import('express');
  const router = Router();

```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/node && npm test -- tests/no-eager-express.test.ts`

Expected: PASS — importing `index.ts` no longer requires `express` (nothing
calls `handshakeRoute()`), so the mocked factory never fires, and
`verifyLaunchToken` is reachable off the barrel.

- [ ] **Step 5: Run the full existing suite to confirm `handshakeRoute()` still works when actually called**

Run: `cd packages/node && npm run build && npm test`

Expected: all existing tests pass, including all 8 tests in
`tests/handshake.test.ts` — these call `handshakeRoute()` directly with a
real (unmocked) `express`, proving the lazy `require` still resolves and
behaves identically for consumers who do use it.

- [ ] **Step 6: Commit**

```bash
git add packages/node/src/handshake.ts packages/node/tests/no-eager-express.test.ts
git commit -m "fix(sdk): defer express require to handshakeRoute() call time"
```

---

### Task 3: Read `MYTHOS_API_URL` per call, thread `apiUrl` to the fetch

**Files:**
- Modify: `packages/node/src/http.ts:1-9` (whole file)
- Modify: `packages/node/src/jwks-cache.ts:18` (pass `apiUrl` through)
- Test: `packages/node/tests/http-config.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `mythosRequest(url: string, init?: RequestInit, apiUrl?: string): Promise<Response>` — third parameter is new, optional, and appended, so both existing call sites (`api-client.ts:16`, `jwks-cache.ts:18`) stay source-compatible. `MYTHOS_HTTP_TIMEOUT_MS` export is unchanged. `mythosRequest` is internal — not re-exported from `index.ts` — so no public API surface changes.

- [ ] **Step 1: Write the failing test**

Create `packages/node/tests/http-config.test.ts`:

```ts
import { mythosRequest } from '../src/http';

const ORIGINAL_API_URL = process.env.MYTHOS_API_URL;

beforeEach(() => {
  (global as unknown as { fetch: jest.Mock }).fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  if (ORIGINAL_API_URL === undefined) {
    delete process.env.MYTHOS_API_URL;
  } else {
    process.env.MYTHOS_API_URL = ORIGINAL_API_URL;
  }
});

test('MYTHOS_API_URL set after import is honored', async () => {
  // The import at the top of this file has already happened by now — that is
  // the point. A module-scope loadConfig() would have frozen the old value.
  process.env.MYTHOS_API_URL = 'https://staging.mythos.test';

  await mythosRequest('/.well-known/jwks.json', { method: 'GET' });

  const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
  expect(url).toBe('https://staging.mythos.test/.well-known/jwks.json');
});

test('explicit apiUrl argument wins over the environment', async () => {
  process.env.MYTHOS_API_URL = 'https://staging.mythos.test';

  await mythosRequest('/.well-known/jwks.json', { method: 'GET' }, 'https://explicit.mythos.test');

  const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
  expect(url).toBe('https://explicit.mythos.test/.well-known/jwks.json');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/node && npm test -- tests/http-config.test.ts`

Expected: FAIL on both. The first gets
`https://api.mythos.work/.well-known/jwks.json` instead of the staging URL,
because `http.ts:5`'s module-scope `const { apiUrl } = loadConfig();` ran at
import time, before the test set the variable. The second fails to compile
/ run because `mythosRequest` currently accepts only two parameters.

- [ ] **Step 3: Move `loadConfig()` inside `mythosRequest` and accept an explicit `apiUrl`**

Current `packages/node/src/http.ts` (whole file):

```ts
import { loadConfig } from './config';

export const MYTHOS_HTTP_TIMEOUT_MS = 5_000;

const { apiUrl } = loadConfig();

export function mythosRequest(url: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiUrl}${url}`, { ...init, signal: AbortSignal.timeout(MYTHOS_HTTP_TIMEOUT_MS) });
}
```

Replace with:

```ts
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

- [ ] **Step 4: Pass `jwks-cache`'s `apiUrl` through to the fetch**

Current `packages/node/src/jwks-cache.ts:18`:

```ts
  const res = await mythosRequest('/.well-known/jwks.json', { method: 'GET' });
```

Replace with:

```ts
  const res = await mythosRequest('/.well-known/jwks.json', { method: 'GET' }, apiUrl);
```

This closes the divergence where `fetchJwks(apiUrl)` used its argument only
as the `_cache` key while the actual request went to `http.ts`'s frozen
module-scope URL. `api-client.ts` is deliberately left unchanged — it has no
`apiUrl` in hand, so it takes the `loadConfig()` default and now picks up
late-set environment on every call.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/node && npm test -- tests/http-config.test.ts`

Expected: PASS (both tests).

- [ ] **Step 6: Run the full existing suite to confirm no regression**

Run: `cd packages/node && npm run build && npm test`

Expected: all existing tests pass. In particular `tests/http.test.ts`'s
existing assertion that `mythosRequest` prepends
`https://api.mythos.work` still holds — that test never sets
`MYTHOS_API_URL`, so per-call `loadConfig()` returns the same default the
module-scope call used to.

- [ ] **Step 7: Commit**

```bash
git add packages/node/src/http.ts packages/node/src/jwks-cache.ts \
  packages/node/tests/http-config.test.ts
git commit -m "fix(sdk): resolve MYTHOS_API_URL per request instead of at import"
```

---

### Task 4: Correct stale claims in docs

**Files:**
- Modify: `docs-site/docs/guides/watch-out-for.md` (the "Also worth knowing" section, currently lines 107-108)

**Interfaces:**
- Consumes: nothing (documentation-only change).
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Replace the stale `sdk_version` bullet**

Current (`docs-site/docs/guides/watch-out-for.md`, "Also worth knowing" section):

```markdown
- The handshake endpoint's `sdk_version` field is currently a hardcoded string in both SDKs, not read from the installed package version. Don't use it to diagnose which SDK build a producer is actually running.
```

Replace with:

```markdown
- The handshake endpoint's `sdk_version` field is sourced differently per SDK: Node generates it from `package.json` at build time (`packages/node/scripts/generate-version.js`), Python reads it via `importlib.metadata.version("mythos-sdk")` (`packages/python/mythos_sdk/version.py`) with a hardcoded fallback if the package isn't installed as a distribution. Neither is guaranteed to reflect the exact commit/build a producer is running in dev-install or monorepo-linked setups — don't use it as a precise build fingerprint.
```

- [ ] **Step 2: Delete the now-fixed JWKS-cache bullet**

Delete this bullet entirely (the line immediately after the one replaced in
Step 1):

```markdown
- The JWKS keyset is cached per-process for 10 minutes and isn't keyed by `MYTHOS_API_URL`. If a single long-running process ever switches API URLs (e.g. an environment cutover without a restart), it can keep validating against the previous environment's keys until the cache naturally expires.
```

Two reasons it goes rather than gets reworded: the stated cause is wrong
(`jwks-cache.ts` has keyed `_cache` by `apiUrl` since 0.1.0), and the
symptom it describes — an environment cutover silently validating against
the old environment's keys — is exactly the `http.ts` bug fixed in Task 3.
Leaving a "watch out for" note about fixed behavior would mislead readers.

- [ ] **Step 3: Verify the doc builds**

Run: `cd docs-site && npm run build` (or the project's existing docs build
command — check `docs-site/package.json` `scripts` if `build` isn't it)

Expected: no broken-link or build errors introduced by this edit.

- [ ] **Step 4: Commit**

```bash
git add docs-site/docs/guides/watch-out-for.md
git commit -m "docs: correct stale sdk_version and JWKS-cache claims"
```

---

## Final verification

- [ ] Run `cd packages/node && npm run build && npm test` — full suite green.
- [ ] Run `cd packages/node && npm pack --dry-run` and confirm `src/version.ts` is absent from the tarball listing (only `dist/` is published per `package.json` `files`) while `dist/version.js` contains a plain literal, not a `createRequire` call.
- [ ] Confirm `dist/index.js` still eagerly requires `./handshake` (expected — the barrel is unchanged) but `dist/handshake.js` no longer has a top-level `require("express")`; it should appear inside the `handshakeRoute` function body instead.
- [ ] Confirm `dist/http.js` has no module-scope `loadConfig()` call.
- [ ] Verify the fresh-clone path: `git stash -u` any local changes, `git clean -n` to confirm `src/version.ts` is tracked (it must NOT appear as removable), then `npx tsc --noEmit` from `packages/node/` — must typecheck without running any npm lifecycle script first.
- [ ] Confirm `packages/node/package.json`'s `version` field gets its normal patch bump as part of the release that ships this fix (not part of this plan's commits — follows this repo's existing release process).
