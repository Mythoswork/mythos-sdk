> **Note:** This is a reference copy. The authoritative location for this
> spec is `frontend-main`'s `docs/adr/fe-int-17-pre-charge-confirmation-spec.md`,
> following that repo's own `fe-int-NN` numbering convention (see
> `fe-int-16-session-teardown-spec.md` for prior art). It's duplicated here
> so the wire-protocol contract and both halves of this feature are
> reviewable from a single PR — no branch or PR has been opened in
> `frontend-main` yet. When that repo's implementation work starts, this
> content becomes its `fe-int-17-...-spec.md`, and an
> `fe-int-17-...-plan.md` gets written there following the same process
> used for this repo's `docs/superpowers/plans/2026-07-16-pre-charge-confirmation.md`.

---

# FE-INT-17 · RUN — Pre-charge confirmation dialog (in-app actions)

**Status:** Pending — depends on mythos-sdk shipping `requireConfirmation`
(this repo, `docs/superpowers/specs/2026-07-16-pre-charge-confirmation-design.md`)
**Ticket:** FE-INT-17 | **Wave:** W3
**Deps:** FE-INT-13 (handshake — `run-frame.tsx` message-listener pattern this reuses), FE-INT-16 (session teardown — this listener must follow the same cleanup contract)

---

## Goal

Jira: "SDK to send FE a notification before app launch" — description
clarifies the actual trigger is a billable action's charge, not app launch:
before a producer app calls `reportUsage` with `requireConfirmation: true`,
the Consumer must see a confirm dialog in the dashboard and click OK before
the charge executes. If the Consumer doesn't respond (or declines), the
charge must not happen.

This is the listener/UI half, implemented in `frontend-main`. The
producer-facing sender half (client SDK option, postMessage send) is this
repo's work, spec'd in
`docs/superpowers/specs/2026-07-16-pre-charge-confirmation-design.md`.

**Not to be confused with:** `run-view.tsx` on `frontend-main`'s
`origin/staging` already has a *different*, already-shipped confirm dialog
— the "Use Premium Feature" `AlertDialog` (`confirmOpen` state, `BalanceRow`
breakdown) shown before the initial **Run** click, confirming the app's
launch cost. That flow is launch-time, producer-app-agnostic, and entirely
dashboard-driven (no postMessage). This ticket's dialog fires **during** a
running session, is triggered by the embedded producer app itself (e.g.
clicking "=" in a calculator), and requires the postMessage round-trip
described below. The two dialogs are independent and can both exist on the
same run page — this ticket must not touch the existing launch-cost dialog.

---

## Protocol Contract

```
Producer iframe → dashboard (window.parent):
  { type: 'mythos:confirm-charge', requestId: string, credits: number, reason?: string }

Dashboard → producer iframe:
  { type: 'mythos:confirm-charge-response', requestId: string, approved: boolean }
```

- Dashboard's response `postMessage` targets the iframe's own origin
  (`launch.iframe_url`'s origin — same value `resolveAllowedOrigins`
  derives from), never `'*'`. Sending dashboard confirm/decline state to
  `'*'` would leak it to whatever page happens to occupy that iframe.
- Dashboard validates the incoming request the same way the existing
  handshake listener does: `isAllowedOrigin(resolveAllowedOrigins(launch),
  event.origin)` before trusting `event.data`.
- No response from the dashboard (dialog dismissed without a choice, user
  navigates away) is the producer client's problem to time out on — the
  dashboard side just doesn't send a response; it does not need its own
  timeout to satisfy this contract, but the dialog should not stay stuck
  forever (see Acceptance Criteria).

---

## Current Implementation Status (frontend-main, `origin/staging`)

`run-frame.tsx` already has one `message` listener (for
`mythos:handshake`, `HANDSHAKE_MESSAGE_TYPE`) attached in a `useEffect`
gated by `!running`, using `resolveAllowedOrigins`/`isAllowedOrigin` for
origin checks. This ticket adds a second, independent listener for
`mythos:confirm-charge` — active only while `running` (charges only happen
after the handshake completes), which is the opposite gating condition from
the handshake listener.

| File | Expected status | Concern |
|---|---|---|
| `src/features/run/components/run-frame.tsx` | Needs new listener + ref | Add `mythos:confirm-charge` listener gated on `running`, reusing existing origin-check helpers. RunFrame owns the iframe (via a new `iframeRef`) and both directions of the postMessage exchange — mirrors how it already owns the handshake listener — and reports up to `run-view.tsx` via a callback prop, the same shape as `onHandshake` |
| `src/features/run/run-machine.ts` | **No change** | The existing launch-cost dialog's `confirmOpen` is local `useState` in `run-view.tsx`, not reducer state — follow the same convention for this dialog. A pending charge-confirm request doesn't affect `RunState.status` (still `running` throughout), so it doesn't belong in the reducer either |
| `src/features/run/components/run-view.tsx` | Needs new dialog wiring | Already has one `AlertDialog` (`confirmOpen` state, for the launch-cost flow — see "Not to be confused with" above). Add a **second**, separately-named local `useState` (e.g. `chargeConfirmRequest`) for the in-run charge dialog; do not reuse or rename `confirmOpen` |
| `src/features/run/components/confirm-charge-dialog.tsx` | New file | Model on the existing inline `AlertDialog` usage in `run-view.tsx` (shadcn `@/components/ui/alert-dialog`, `BalanceRow` cost breakdown, `Zap` icon eyebrow) rather than `low-balance-banner.tsx` — the app already has an established "confirm this credit spend" modal pattern; this is the same concept, just triggered by the iframe instead of the Run button |

---

## Acceptance Criteria

- [ ] When the iframe posts `mythos:confirm-charge` with a valid origin
      while the run is `running`, a dialog appears showing the credits
      amount (and `reason` if present) with OK / Cancel actions
- [ ] Clicking OK posts `{ type: 'mythos:confirm-charge-response',
      requestId, approved: true }` back to the iframe's `contentWindow`,
      targeting the iframe's own origin (not `'*'`)
- [ ] Clicking Cancel posts the same shape with `approved: false`
- [ ] The dialog is dismissed (and no further response is sent for that
      `requestId`) if the user navigates away or the session resets —
      reuses the same listener-cleanup contract as FE-INT-16
- [ ] A `mythos:confirm-charge` received with a disallowed `event.origin`
      is silently ignored (no dialog, matches handshake listener's
      existing silent-ignore behavior for bad origins)
- [ ] A second `mythos:confirm-charge` arriving while a dialog for a prior
      `requestId` is still open either queues or replaces it — pick one
      explicitly when the frontend-main plan is written; don't leave it
      undefined
- [ ] The existing launch-cost `AlertDialog` (`confirmOpen` state) is
      untouched — both dialogs can coexist without interfering

---

## Out of Scope

- The producer SDK's send-side implementation (this repo, `mythos-sdk`)
- Confirm-timeout behavior on the producer side — that's the SDK's
  fail-closed timer, not the dashboard's; the dashboard has no timeout of
  its own, it just may respond late or never
- Persisting confirm decisions across page reloads — every charge gets a
  fresh confirmation, no "remember my choice"
- Any change to the `mythos:handshake` listener or its gating — this is an
  independent, second listener
