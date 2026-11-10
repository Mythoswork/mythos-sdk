# Browser client

Choose the browser entry point that fits your application; each exposes the same session-aware client.

| Application | Import |
|---|---|
| React | `import { useMythos } from '@mythos-work/sdk/react'` |
| Any bundled page | `import { initMythos } from '@mythos-work/sdk/client'` |
| No bundler | The global `<script>` build |

## React

```tsx
const { status, session, error, fetch, confirmCharge, relaunch } = useMythos();
```

## Any bundled page

```ts
import { initMythos } from '@mythos-work/sdk/client';

const m = initMythos();
await m.ready;
const unsubscribe = m.subscribe(() => console.log(m.state.status));
```

## No bundler

```html
<script src="https://cdn.jsdelivr.net/npm/@mythos-work/sdk@0.6.0/dist/mythos-client.global.js"></script>
<script>const m = Mythos.initMythos();</script>
```

## Statuses

| Status | Meaning | What your UI should do |
|---|---|---|
| `loading` | Session initialization is in progress | Show a loading state |
| `mythos` | A Mythos launch session is active | Enable Mythos billing |
| `standalone` | The app was opened outside Mythos | Use your own auth or paywall |
| `expired` | The launch session expired | Embedded clients request a relaunch automatically; offer `relaunch()` as a manual fallback |
| `error` | Initialization failed | Show `error` and a retry path |

## Automatic relaunch

`initMythos({ autoRelaunch: false })` disables the default one-time `mythos:relaunch` request to the embedding Mythos dashboard on expiry. For manual recovery, display a `relaunch()` button when status is `expired`. Standalone pages never post a relaunch. The client schedules a silent session refresh before identity expiry and checks again when a background tab becomes visible.

## Transport

The client uses an HTTP-only cookie first, so session credentials are normally unavailable to JavaScript. If the browser blocks cookies, the SDK falls back to its managed transport. Your code never reads, parses, or stores Mythos tokens in `localStorage` or `sessionStorage`. This keeps transport details inside the SDK while preserving the same API in embedded and standalone browsers.

Use `m.fetch` (or the `fetch` returned by `useMythos`) like native `fetch`; it automatically attaches the current session. Before a billable action, call `confirmCharge({ usd: 0.15, reason })` for a fixed price, or `confirmCharge({ kind: 'llm', reason })` for LLM calls — those are usage-based (provider cost plus your margin, settled after the response), so they take no credits.

## Confirm a USD charge

```ts
const { approved, consentId } = await m.confirmCharge({ usd: 0.15, reason: 'calculate' });
if (approved) await m.fetch('/api/calculate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ consentId }),
});
```

After approval, charge the same amount on the server with `mythos.charge(req, { usd: 0.15, reason: 'calculate', consentId })`. Alternatively, use `credits: 1500` directly in both calls. USD accepts a positive number or exact decimal string with at most 4 decimal places. Computed floats such as `0.1 + 0.2` are rejected, never rounded; round first with `Number(x.toFixed(2))` or pass a string.

The approval popup shows **credits**, converted using the session's `creditsPerUsd` rate. USD confirmation requires an `initMythos` / `useMythos` session rate; missing rates (including old-backend sessions) reject with `USD_RATE_UNAVAILABLE` (503). The standalone boolean-returning `confirmCharge` from `@mythos-work/sdk/client` accepts credits only.
