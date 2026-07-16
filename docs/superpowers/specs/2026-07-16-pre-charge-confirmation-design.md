# Pre-charge confirmation for client-side reportUsage

Jira: SDK to send FE a notification before app launch (payment execution)

## Problem

Ticket asks: before a billable action executes payment (`reportUsage`), the
Consumer must see a confirmation popup and click OK before the charge fires.
Today `reportUsage` / `reportMythosUsage` in the reference client snippets
(`docs/examples/mythos-client.js`, `docs/examples/mythos-client.ts`) are
fire-and-forget and non-blocking by design (see
[usage-metering.md](../../concepts/usage-metering.md#non-fatal-on-frontend)) —
callers are told to invoke `reportUsage` **after** the billable action
succeeds and never block on it. This ticket wants the opposite for actions
that opt in: block, confirm, then charge.

## Scope

- `docs/examples/mythos-client.js` (vanilla JS reference client)
- `docs/examples/mythos-client.ts` (TypeScript reference client)
- `docs/concepts/usage-metering.md` (new documented section)

Out of scope: `packages/node`, `packages/python` (server SDK). This is a
browser-side, iframe-to-parent-frame concern — the server SDK has no channel
to the Consumer's browser. Also out of scope: implementing the listener on
the Mythos dashboard (parent frame) side — that's the platform's
responsibility, not this SDK's. This spec documents the contract the SDK
speaks; it does not implement the other end.

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

Producer → parent:
```json
{ "type": "mythos:confirm-charge", "requestId": "<uuid>", "credits": 1, "reason": "calculator:multiply" }
```

Parent → producer:
```json
{ "type": "mythos:confirm-charge-response", "requestId": "<uuid>", "approved": true }
```

The producer client validates `event.source === window.parent` and matches
`requestId` before trusting a response — ignore anything else received on
the `message` listener.

## Fail-closed behavior

Matches this SDK's existing fail-closed philosophy (see
[launch-sessions.md ADR-0003](../../concepts/launch-sessions.md#single-use-enforcement-adr-0003)).
When `requireConfirmation: true` and any of the following occur, the charge
is **skipped** (no `POST /api/mythos/report-usage` call), a `console.warn`
is logged, and the function resolves without throwing:

- Not embedded (`window === window.parent`) — skip immediately, no
  postMessage sent, no wait.
- No matching `mythos:confirm-charge-response` within `confirmTimeoutMs`.
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
shapes above), the fail-closed cases, and an explicit note that implementing
the `mythos:confirm-charge` listener is the Mythos dashboard's
responsibility — producers using this flag are relying on dashboard support
existing, and today it may not.

## Testing

No existing test harness covers `docs/examples/*` (they are copy-paste
reference snippets, not built/tested package code, and no test file
currently targets them). Consistent with that existing pattern, no new test
infra is added in this change.
