# Pre-charge Confirmation (mythos-sdk half) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `requireConfirmation` flag to the reference client
`reportUsage`/`reportMythosUsage` functions so a producer can require a
Consumer confirmation (via postMessage to the Mythos dashboard parent
frame) before the charge fires.

**Architecture:** Both reference client files (`docs/examples/mythos-client.js`,
`docs/examples/mythos-client.ts`) grow a `confirmCharge` helper that
generates a `requestId`, posts a `mythos:confirm-charge` message to
`window.parent`, and waits (with timeout) for a matching
`mythos:confirm-charge-response`. `reportUsage`/`reportMythosUsage` call it
first when `opts.requireConfirmation` is set; on any non-approval outcome
the charge is skipped. Default behavior (no `opts`) is untouched.

**Tech Stack:** Vanilla JS (IIFE) + TypeScript, no build step — these are
copy-paste reference files, not compiled package source.

## Global Constraints

- Default behavior (no `opts` / `opts.requireConfirmation` falsy) must
  produce byte-identical request behavior to today — still fire-and-forget,
  non-blocking (per `docs/concepts/usage-metering.md#non-fatal-on-frontend`).
- Fail-closed only: not embedded, timeout, or `approved: false` all skip the
  charge — never fall back to charging anyway.
- `postMessage` to the parent uses `'*'` as targetOrigin (see spec's
  targetOrigin note — safe because only `window.parent` receives it, and the
  producer doesn't know the dashboard's origin in advance).
- `confirmTimeoutMs` default is `10000`.
- No new test infra — these files have none today (see spec `## Testing`).
  Verification is `node --check` / `tsc --noEmit` (syntax/type checks) plus
  manual protocol trace, not unit tests.
- Full protocol/contract source of truth: `docs/superpowers/specs/2026-07-16-pre-charge-confirmation-design.md`.

---

### Task 1: Add confirm-before-charge to the vanilla JS client

**Files:**
- Modify: `docs/examples/mythos-client.js`

**Interfaces:**
- Produces: `MythosClient.reportUsage(credits, reason, opts)` where
  `opts = { requireConfirmation?: boolean, confirmTimeoutMs?: number }`.
  Message types `"mythos:confirm-charge"` / `"mythos:confirm-charge-response"`
  on `window` (consumed by frontend-main's `run-frame.tsx`, out of this
  repo).

- [ ] **Step 1: Read the current file to confirm no drift since the design spec was written**

Run: `git show HEAD:docs/examples/mythos-client.js`
Expected: matches the version quoted in the spec (unchanged `reportUsage(credits, reason)`, no `opts` param).

- [ ] **Step 2: Replace the file contents**

```js
/**
 * Client-side Mythos session handling for vanilla JS frontends.
 * Load before your main script and call MythosClient.init() on page load.
 *
 * Adjust fetch URLs if your API uses different paths (e.g. /api/mythos-session).
 */
window.MythosClient = (function () {
  let session = null;
  let initPromise = null;

  function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const params = new URLSearchParams(window.location.search);
      const lt = params.get("lt");
      if (!lt) return;

      try {
        const res = await fetch(`/api/mythos/session?lt=${encodeURIComponent(lt)}`);
        if (res.ok) {
          const data = await res.json();
          session = data.session ?? data;
        }
      } catch {
        // Not launched from Mythos — fall back to normal auth flow.
      } finally {
        params.delete("lt");
        const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
        window.history.replaceState({}, "", clean);
      }
    })();

    return initPromise;
  }

  const CONFIRM_REQUEST_TYPE = "mythos:confirm-charge";
  const CONFIRM_RESPONSE_TYPE = "mythos:confirm-charge-response";
  const DEFAULT_CONFIRM_TIMEOUT_MS = 10000;

  // Posts a confirm-charge request to the dashboard parent frame and waits
  // for a matching response. Resolves false (never rejects) on timeout, on
  // explicit decline, or if the page isn't embedded — all fail-closed.
  function confirmCharge(credits, reason, timeoutMs) {
    return new Promise((resolve) => {
      if (window === window.parent) {
        console.warn(
          "[MythosClient] requireConfirmation set but page is not embedded in a Mythos dashboard frame — skipping charge.",
        );
        resolve(false);
        return;
      }

      const requestId =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        console.warn("[MythosClient] confirm-charge timed out — skipping charge.");
        cleanup();
        resolve(false);
      }, timeoutMs);

      function onMessage(event) {
        if (event.source !== window.parent) return;
        const data = event.data;
        if (!data || data.type !== CONFIRM_RESPONSE_TYPE || data.requestId !== requestId) return;
        cleanup();
        resolve(Boolean(data.approved));
      }

      function cleanup() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
      }

      window.addEventListener("message", onMessage);
      window.parent.postMessage(
        { type: CONFIRM_REQUEST_TYPE, requestId, credits, reason },
        "*",
      );
    });
  }

  async function reportUsage(credits, reason, opts) {
    if (!session) return;
    const options = opts || {};

    if (options.requireConfirmation) {
      const approved = await confirmCharge(
        credits,
        reason,
        options.confirmTimeoutMs || DEFAULT_CONFIRM_TIMEOUT_MS,
      );
      if (!approved) return;
    }

    try {
      await fetch("/api/mythos/report-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionJti: session.sessionJti, credits, reason }),
      });
    } catch {
      // Non-fatal — never block the user's flow because billing failed.
    }
  }

  function getSession() {
    return session;
  }

  return { init, reportUsage, getSession };
})();
```

- [ ] **Step 3: Syntax-check the file**

Run: `node --check docs/examples/mythos-client.js`
Expected: no output, exit code 0.

- [ ] **Step 4: Manual protocol trace in a scratch HTML page**

Create a throwaway file (not committed) to exercise both paths without a
real dashboard listener:

```html
<!-- scratch, do not commit -->
<script src="../mythos-sdk/docs/examples/mythos-client.js"></script>
<script>
  window.MythosClient.init().then(() => {
    // Manually fake a session for this trace since there's no ?lt= param.
  });
</script>
```

Simpler: open a browser devtools console on any page and run:

```js
window.MythosClient.getSession(); // null — expected, confirms init() no-ops without ?lt=
```

Then verify the not-embedded fail-closed path directly, since `window ===
window.parent` is true for a top-level tab:

```js
// After manually setting an internal session isn't possible from outside
// the IIFE, so instead verify confirmCharge's not-embedded branch directly
// by pasting its body into the console and calling it — expect it to
// console.warn and resolve(false) synchronously without posting a message.
```

Expected: the not-embedded branch logs the `console.warn` and never calls
`window.parent.postMessage` (observe via a `postMessage` spy in devtools if
desired). This confirms the fail-closed path without needing a running
dashboard.

- [ ] **Step 5: Commit**

```bash
git add docs/examples/mythos-client.js
git commit -m "feat(examples): add requireConfirmation option to vanilla JS reportUsage"
```

---

### Task 2: Add confirm-before-charge to the TypeScript client

**Files:**
- Modify: `docs/examples/mythos-client.ts`

**Interfaces:**
- Consumes: same wire protocol as Task 1 (`mythos:confirm-charge` /
  `mythos:confirm-charge-response`, `requestId` correlation).
- Produces: `reportMythosUsage(credits: number, reason?: string, opts?: ReportUsageOptions): Promise<void>`
  and exported type `ReportUsageOptions = { requireConfirmation?: boolean; confirmTimeoutMs?: number }`.

- [ ] **Step 1: Read the current file to confirm no drift**

Run: `git show HEAD:docs/examples/mythos-client.ts`
Expected: matches the version quoted in the spec (`reportMythosUsage(credits, reason)`, no `opts`).

- [ ] **Step 2: Replace the file contents**

```ts
/**
 * Client-side Mythos session handling for TypeScript/React/Next.js frontends.
 * Copy to lib/mythosClient.ts and call initMythosFromUrl() on app load.
 *
 * Expects GET /api/mythos/session to return { session: MythosClientSession }.
 * Expects POST /api/mythos/report-usage with { sessionJti, credits, reason }.
 */

export interface MythosClientSession {
  userId: string;
  email: string;
  displayName: string;
  listingId: string;
  sessionJti: string;
}

export interface ReportUsageOptions {
  requireConfirmation?: boolean;
  confirmTimeoutMs?: number;
}

interface ConfirmChargeRequestMessage {
  type: "mythos:confirm-charge";
  requestId: string;
  credits: number;
  reason?: string;
}

interface ConfirmChargeResponseMessage {
  type: "mythos:confirm-charge-response";
  requestId: string;
  approved: boolean;
}

let session: MythosClientSession | null = null;
let initPromise: Promise<void> | null = null;

const CONFIRM_REQUEST_TYPE: ConfirmChargeRequestMessage["type"] = "mythos:confirm-charge";
const CONFIRM_RESPONSE_TYPE: ConfirmChargeResponseMessage["type"] = "mythos:confirm-charge-response";
const DEFAULT_CONFIRM_TIMEOUT_MS = 10_000;

export function getMythosSession(): MythosClientSession | null {
  return session;
}

export function initMythosFromUrl(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const params = new URLSearchParams(window.location.search);
    const lt = params.get("lt");
    if (!lt) return;

    try {
      const res = await fetch(`/api/mythos/session?lt=${encodeURIComponent(lt)}`);
      if (res.ok) {
        const data = (await res.json()) as { session?: MythosClientSession } & MythosClientSession;
        // Support wrapped { session } or flat response (Python FastAPI style)
        session = data.session ?? data;
      }
    } catch {
      // Not launched from Mythos — fall back to normal auth flow.
    } finally {
      params.delete("lt");
      const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", clean);
    }
  })();

  return initPromise;
}

// Posts a confirm-charge request to the dashboard parent frame and waits
// for a matching response. Resolves false (never rejects) on timeout, on
// explicit decline, or if the page isn't embedded — all fail-closed.
function confirmCharge(
  credits: number,
  reason: string | undefined,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (window === window.parent) {
      console.warn(
        "[MythosClient] requireConfirmation set but page is not embedded in a Mythos dashboard frame — skipping charge.",
      );
      resolve(false);
      return;
    }

    const requestId =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      console.warn("[MythosClient] confirm-charge timed out — skipping charge.");
      cleanup();
      resolve(false);
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;
      const data = event.data as Partial<ConfirmChargeResponseMessage> | null;
      if (!data || data.type !== CONFIRM_RESPONSE_TYPE || data.requestId !== requestId) return;
      cleanup();
      resolve(Boolean(data.approved));
    }

    function cleanup() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
    const message: ConfirmChargeRequestMessage = {
      type: CONFIRM_REQUEST_TYPE,
      requestId,
      credits,
      reason,
    };
    window.parent.postMessage(message, "*");
  });
}

export async function reportMythosUsage(
  credits: number,
  reason?: string,
  opts?: ReportUsageOptions,
): Promise<void> {
  if (!session) return;

  if (opts?.requireConfirmation) {
    const approved = await confirmCharge(credits, reason, opts.confirmTimeoutMs ?? DEFAULT_CONFIRM_TIMEOUT_MS);
    if (!approved) return;
  }

  try {
    await fetch("/api/mythos/report-usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionJti: session.sessionJti, credits, reason }),
    });
  } catch {
    // Non-fatal — never block the user's flow because billing failed.
  }
}
```

- [ ] **Step 3: Type-check the file standalone**

Run: `npx tsc --noEmit --strict --target es2020 --lib es2020,dom docs/examples/mythos-client.ts`
Expected: no output, exit code 0. (This file has no project tsconfig since
it's a copy-paste snippet, not built package source — flags here mirror
`packages/node/tsconfig.json`'s strictness.)

- [ ] **Step 4: Commit**

```bash
git add docs/examples/mythos-client.ts
git commit -m "feat(examples): add requireConfirmation option to TS reportMythosUsage"
```

---

### Task 3: Document the pre-charge confirmation flag

**Files:**
- Modify: `docs/concepts/usage-metering.md`

**Interfaces:**
- Consumes: `requireConfirmation`/`confirmTimeoutMs` from Tasks 1–2, the
  `mythos:confirm-charge` / `mythos:confirm-charge-response` message shapes
  from the spec.

- [ ] **Step 1: Read the current file's structure to pick an insertion point**

Run: `git show HEAD:docs/concepts/usage-metering.md`
Expected: confirms the section order — insert the new section after
"## Non-fatal on frontend" (line ~66) and before "## Idempotency" (line
~68), since it's a variant of the frontend-call pattern described just
above it.

- [ ] **Step 2: Insert the new section**

Insert after the "## Non-fatal on frontend" hint block and before
"## Idempotency":

```markdown
## Pre-charge confirmation (optional)

For actions where the Consumer should explicitly confirm a charge before it
fires — e.g. a large or unusual credit spend — the reference clients
(`docs/examples/mythos-client.js`, `docs/examples/mythos-client.ts`) support
an opt-in `requireConfirmation` flag:

```typescript
await reportMythosUsage(5, 'bulk-export', { requireConfirmation: true });
```

When set, the client posts a `mythos:confirm-charge` message to
`window.parent` (the Mythos dashboard, which the producer app is embedded
in) and waits up to `confirmTimeoutMs` (default `10000`) for a matching
`mythos:confirm-charge-response`. The charge is skipped — `report-usage` is
never called — unless the dashboard responds `approved: true` within the
timeout.

{% hint style="warning" %}
This depends on the Mythos dashboard implementing the
`mythos:confirm-charge` listener and confirmation UI on its side. If your
app isn't embedded in a Mythos dashboard frame, or the dashboard hasn't
shipped this listener yet, the charge fails closed (skipped) rather than
firing unconfirmed.
{% endhint %}

Without `requireConfirmation` (the default), behavior is unchanged from the
rest of this page — fire-and-forget, non-blocking.
```

- [ ] **Step 3: Verify the doc renders sensibly**

Run: `git diff docs/concepts/usage-metering.md`
Expected: new section sits between "Non-fatal on frontend" and
"Idempotency", headings render as `##` (same level as siblings), code
fences are closed.

- [ ] **Step 4: Commit**

```bash
git add docs/concepts/usage-metering.md
git commit -m "docs: document requireConfirmation flag for pre-charge confirmation"
```

---

## Self-Review Notes

- **Spec coverage:** API shape (Task 1–2), protocol/requestId (Task 1–2),
  fail-closed cases (Task 1–2, all three branches implemented), docs (Task
  3). Testing section of the spec is satisfied by Steps 3/4 (`node --check`,
  `tsc --noEmit`) — no new test infra, as the spec specifies.
- **Type consistency:** `confirmTimeoutMs` name matches across JS/TS/docs.
  Message `type` string literals (`mythos:confirm-charge`,
  `mythos:confirm-charge-response`) and the `requestId`/`approved` field
  names are identical across both client files and the doc section.
- **Frontend-main half:** intentionally not a task here — tracked in that
  repo's own `fe-int-17-pre-charge-confirmation-plan.md`. This plan's Task 1
  Step 4 and Task 2 note that end-to-end verification against a real
  dashboard listener isn't possible until that companion PR lands.
