# Pre-charge confirmation for client-side reportUsage

Jira: SDK to send FE a notification before app launch (payment execution)

**Status note:** The files this spec targets (`docs/examples/*`,
`docs/concepts/usage-metering.md`) exist on the `docs/watch-out-for-and-other-languages`
branch (unmerged docs restructuring), not on `main`. This spec/plan's PR is
based on `main` regardless — a deliberate choice, not an oversight. Task 1
Step 1 in the plan will fail to find these files until that docs branch (or
its successor) merges to `main`; implementation should happen after that
merge, or against a branch that includes it.

## Problem

Ticket asks: before a billable action executes payment (`reportUsage`), the
Consumer must see a confirmation popup and click OK before the charge fires.
Today `reportUsage` / `reportMythosUsage` in the reference client snippets
(`docs/examples/mythos-client.js`, `docs/examples/mythos-client.ts`) are
fire-and-forget and non-blocking by design (see
[usage-metering.md](../concepts/usage-metering.md#non-fatal-on-frontend)) —
callers are told to invoke `reportUsage` **after** the billable action
succeeds and never block on it. This ticket wants the opposite for actions
that opt in: block, confirm, then charge.

## Scope

This is a cross-repo feature — this repo (`mythos-sdk`) implements the
sender half; `frontend-main` (the Mythos dashboard, `D:\frontend-main`)
implements the listener/UI half. They ship as two separate branches/PRs,
coordinated by this spec.

**mythos-sdk (this repo):**

- `docs/examples/mythos-client.js` (vanilla JS reference client)
- `docs/examples/mythos-client.ts` (TypeScript reference client)
- `docs/concepts/usage-metering.md` (new documented section)

Out of scope here: `packages/node`, `packages/python` (server SDK). This is
a browser-side, iframe-to-parent-frame concern — the server SDK has no
channel to the Consumer's browser.

**frontend-main (companion repo, tracked as FE-INT-17 there):**

- `src/features/run/components/run-frame.tsx` — add `mythos:confirm-charge`
  listener alongside the existing `mythos:handshake` one, reusing
  `resolveAllowedOrigins`/`isAllowedOrigin` from `src/features/run/origin.ts`
  for origin validation (same pattern the handshake listener already uses).
- `src/features/run/run-machine.ts` — new events/state for the confirm flow.
- `src/features/run/components/run-view.tsx` — wires the new state to a
  banner.
- New `src/features/run/components/confirm-charge-banner.tsx`, modeled on
  the existing `low-balance-banner.tsx` (plain `role="alert"` div, not the
  MUI `confirmation-modal.tsx` — that one is listing/purchase-shaped and
  styled differently from the run page).

Full detail for the frontend-main half lives in that repo's own spec/plan
pair, `docs/adr/fe-int-17-pre-charge-confirmation-spec.md` and
`-plan.md`, following its existing `fe-int-NN` numbering convention (see
`fe-int-16-session-teardown-spec.md` for the most recent prior art). A
reference copy is also kept in this repo at
`docs/adr/fe-int-17-frontend-main-companion-spec.md` since no branch/PR
exists in `frontend-main` yet. This document is the source of truth for the
wire protocol both repos implement against.

## API

Both reference clients get a new optional third parameter on their usage
function. Default behavior (no `opts`) is unchanged — still fire-and-forget,
non-blocking.

```ts
// mythos-client.ts
async function reportMythosUsage(
  credits: number,
  reason?: string,
  opts?: { requireConfirmation?: boolean; confirmTimeoutMs?: number },
): Promise<void>
```

```js
// mythos-client.js
async function reportUsage(credits, reason, opts = {})
```

`opts.confirmTimeoutMs` defaults to `10000`.

## Protocol

Producer app runs inside an iframe on the Mythos dashboard (confirmed from
the ticket's screenshot — credit-counter chrome around the embedded app is
the dashboard's own FE). Confirmation is negotiated via `postMessage` between
the iframe (producer client) and `window.parent` (dashboard).

The ticket's "unique code for notification popup" requirement is the
`requestId`: generated fresh inside the client's `reportUsage` call for
every confirmation round-trip, it's how the dashboard's response is matched
back to the specific charge that requested it (two overlapping charges in
flight — unlikely but not impossible — don't cross-resolve each other).

Producer → parent:
```json
{ "type": "mythos:confirm-charge", "requestId": "<uuid>", "credits": 1, "reason": "calculator:multiply" }
```

Parent → producer:
```json
{ "type": "mythos:confirm-charge-response", "requestId": "<uuid>", "approved": true }
```

Producer → parent, on give-up (new — closes a gap found in review):
```json
{ "type": "mythos:confirm-charge-timeout", "requestId": "<uuid>" }
```

The producer client validates `event.source === window.parent` and matches
`requestId` before trusting a response — ignore anything else received on
the `message` listener.

**Why `mythos:confirm-charge-timeout` exists:** the dashboard has no timeout
of its own (see Fail-closed behavior) — it only stops listening for the
user's click once the producer's `confirmTimeoutMs` elapses and the
producer removes its `message` listener. Without a give-up notice, a user
who takes longer than `confirmTimeoutMs` to click OK gets a dialog that
silently does nothing — the click posts a response nobody is listening for,
with no error shown. The producer client posts this message immediately
before resolving `false` on timeout, so the dashboard can react (e.g. gray
out the dialog, show "request expired") instead of leaving a live-looking
but dead control on screen. `frontend-main`'s `fe-int-17` work is expected
to listen for it; see the companion spec's Acceptance Criteria.

**targetOrigin:** the producer → parent message is sent with `postMessage(msg, '*')`
— the producer client generally doesn't know the dashboard's origin, and
this is safe because only `window.parent` ever receives it (it isn't
broadcast). The parent → producer direction is different: `frontend-main`
already knows the exact iframe origin (`launch.iframe_url`, same value
`resolveAllowedOrigins` derives from) and its response postMessage must
target that origin explicitly, not `'*'` — this is a requirement on the
frontend-main side, not something mythos-sdk enforces, but it's called out
here since a wildcard there would be a real leak (dashboard state going to
whatever page happens to be in that iframe).

## Fail-closed behavior

Matches this SDK's existing fail-closed philosophy (see
[launch-sessions.md ADR-0003](../concepts/launch-sessions.md#single-use-enforcement-adr-0003)).
When `requireConfirmation: true` and any of the following occur, the charge
is **skipped** (no `POST /api/mythos/report-usage` call), a `console.warn`
is logged, and the function resolves without throwing:

- Not embedded (`window === window.parent`) — skip immediately, no
  postMessage sent, no wait.
- No matching `mythos:confirm-charge-response` within `confirmTimeoutMs` —
  also posts `mythos:confirm-charge-timeout` to the parent before giving up
  (see Protocol).
- Response received with `approved: false`.

Only `approved: true` within the timeout proceeds to the existing
fetch-based report-usage call.

## Error handling

- The confirm/report flow stays consistent with existing non-fatal style:
  network failures on the `report-usage` fetch itself are still caught and
  swallowed (unchanged from current behavior).
- A declined or timed-out confirmation is not an error — it's an expected
  "Consumer said no" / "no listener available" outcome, so no exception is
  thrown to the caller either way. Callers that want to know the outcome
  will get it via the resolved promise being a no-op vs. an actual charge;
  if callers need to distinguish, that's a documented future extension, not
  in scope here.

## Docs

Add a "Pre-charge confirmation (optional)" section to `usage-metering.md`
covering: the `requireConfirmation` flag, the postMessage contract (message
shapes above, including `mythos:confirm-charge-timeout`), the fail-closed
cases, and an explicit note that implementing the `mythos:confirm-charge`
listener is the Mythos dashboard's responsibility — producers using this
flag are relying on dashboard support existing, and today it may not.

## Testing

No existing test harness covers `docs/examples/*` (they are copy-paste
reference snippets, not built/tested package code, and no test file
currently targets them). Consistent with that existing pattern, no new
automated test infra is added in this change. Verification is a concrete,
runnable two-page manual harness (a fake dashboard page in an outer window,
a fake producer page in an iframe, with `window.fetch` stubbed so no real
backend is needed) — see the plan's Task 1 Step 4 for the exact files and
steps. This exercises the real `reportUsage` → `confirmCharge` →
`postMessage` path end-to-end, not just a description of what should
happen.
