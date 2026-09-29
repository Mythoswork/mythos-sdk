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
<script src="https://cdn.jsdelivr.net/npm/@mythos-work/sdk@0.3.0/dist/mythos-client.global.js"></script>
<script>const m = Mythos.initMythos();</script>
```

## Statuses

| Status | Meaning | What your UI should do |
|---|---|---|
| `loading` | Session initialization is in progress | Show a loading state |
| `mythos` | A Mythos launch session is active | Enable Mythos billing |
| `standalone` | The app was opened outside Mythos | Use your own auth or paywall |
| `expired` | The launch session expired | Offer `relaunch()` |
| `error` | Initialization failed | Show `error` and a retry path |

## Transport

The client uses an HTTP-only cookie first, so session credentials are normally unavailable to JavaScript. If the browser blocks cookies, the SDK falls back to its managed transport. Your code never reads, parses, or stores Mythos tokens in `localStorage` or `sessionStorage`. This keeps transport details inside the SDK while preserving the same API in embedded and standalone browsers.

Use `m.fetch` (or the `fetch` returned by `useMythos`) like native `fetch`; it automatically attaches the current session. Before a billable action, call `confirmCharge({ credits, reason })` for a fixed price, or `confirmCharge({ kind: 'llm', reason })` for LLM calls — those are usage-based (provider cost plus your margin, settled after the response), so they take no credits. If the status becomes `expired`, call `relaunch()` to ask the Mythos dashboard to launch the app again.
