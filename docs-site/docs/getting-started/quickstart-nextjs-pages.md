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
MYTHOS_SESSION_SECRET=                     # openssl rand -base64 32  (≥ 32 chars)
```

## 3. Server: one file, one route
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

## 4. Charge credits
```ts
// pages/api/calculate.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { MythosError } from '@mythos-work/sdk';
import { mythos } from '../../lib/mythos';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await mythos.charge(req, { credits: 1, reason: 'calculate' });
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
    const { approved } = await confirmCharge({ credits: 1, reason: '1 + 2' });
    if (approved) await fetch('/api/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1, b: 2 }) });
  }
  return <button onClick={calculate}>Calculate (1 credit)</button>;
}
```

## Check it
```bash
npx @mythos-work/sdk doctor
```
Then launch your listing from the Mythos dashboard.
