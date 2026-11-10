---
title: Quickstart — Next.js (Pages Router)
sidebar_label: Next.js (Pages Router)
---

Zero to a billed charge in 5 steps.

## 1. Install and scaffold
```bash
npm i @mythos-work/sdk
npx @mythos-work/sdk init
```

## 2. Environment
```bash
# .env.local
MYTHOS_LISTING_ID=your-listing-id
# openssl rand -base64 32  (≥ 32 chars)
MYTHOS_SESSION_SECRET=
# Mythos dashboard → Settings → Mythos key
MYTHOS_KEY=
```

## 3. Server: one file, one route
Missing `MYTHOS_KEY` is soft; static listing launches remain silent, while dynamic registration, handshake and callbacks warn once per process. It will be required in a future release. Update deployment env after key regeneration. See the [binding matrix](../reference/configuration.md).

| Troubleshooting code | Fix |
|---|---|
| `PRODUCER_MISMATCH` | The `MYTHOS_KEY` in this deployment belongs to a different Producer, or was regenerated. Copy the current key from the dashboard and redeploy. |

```ts
// lib/mythos.ts
import { createMythos } from '@mythos-work/sdk';
export const mythos = createMythos();
```
```ts
// pages/api/mythos/[...mythos].ts
import { pagesHandler } from '@mythos-work/sdk/next';
import { mythos } from '../../../lib/mythos';
export default pagesHandler(mythos);
```
```js
// next.config.js — add these rewrites
async rewrites() { return [
  { source: '/.well-known/mythos-handshake', destination: '/api/mythos/handshake' },
  { source: '/.well-known/mythos-listing-registered', destination: '/api/mythos/listing-registered' },
]; }
```

## 4. Charge USD
```ts
// pages/api/calculate.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { MythosError } from '@mythos-work/sdk';
import { mythos } from '../../lib/mythos';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await mythos.charge(req, { usd: 0.15, reason: 'calculate', consentId: req.body.consentId });
    res.json({ success: true, data: { result: req.body.a + req.body.b } });
  } catch (err) {
    if (err instanceof MythosError) return res.status(err.httpStatus).json({ success: false, error: err.message, code: err.code });
    throw err;
  }
}
```

## 5. Page
```tsx
import { useMythos } from '@mythos-work/sdk/react';
export default function Calculator() {
  const { status, fetch, confirmCharge, relaunch } = useMythos();
  if (status === 'loading') return <p>Loading…</p>;
  if (status === 'standalone') return <p>Open this app from Mythos.</p>;
  if (status === 'expired') return <button onClick={relaunch}>Relaunch</button>;
  if (status === 'error') return <p>Something went wrong.</p>;
  async function calculate() {
    const { approved, consentId } = await confirmCharge({ usd: 0.15, reason: 'calculate' });
    if (approved) await fetch('/api/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1, b: 2, consentId }) });
  }
  return <button onClick={calculate}>Calculate ($0.15)</button>;
}
```

The popup shows credits using the session rate; the server charges the same USD amount. Alternatively, use `credits: 1500` directly in both calls. See [USD confirmation](./browser-client.md#confirm-a-usd-charge) for decimal validation and `USD_RATE_UNAVAILABLE`.

## Check it
```bash
npx @mythos-work/sdk doctor
```
Then launch your listing from the Mythos dashboard.
