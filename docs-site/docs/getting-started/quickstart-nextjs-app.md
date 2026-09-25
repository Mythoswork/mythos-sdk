---
title: Quickstart — Next.js (App Router)
sidebar_label: Next.js (App Router)
---

Zero to a billed charge in 5 steps.

## 1. Install and scaffold
```bash
npm i @mythos-work/sdk
npx @mythos-work/sdk init
```
`init` creates the files below and adds env placeholders to `.env.local`. Or create them by hand:

## 2. Environment
```bash
# .env.local
MYTHOS_LISTING_ID=your-listing-id          # from the Mythos dashboard
MYTHOS_SESSION_SECRET=                     # openssl rand -base64 32  (≥ 32 chars)
```

## 3. Server: one file, one route
```ts
// lib/mythos.ts
import { createMythos } from '@mythos-work/sdk';
export const mythos = createMythos();
```
```ts
// app/api/mythos/[...mythos]/route.ts
import { mythos } from '../../../../lib/mythos';
export const { GET, POST } = mythos.handlers;
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
// app/api/calculate/route.ts
import { MythosError } from '@mythos-work/sdk';
import { mythos } from '@/lib/mythos';

export async function POST(req: Request) {
  const { a, b } = await req.json();
  try {
    await mythos.charge(req, { credits: 1, reason: 'calculate' });
    return Response.json({ success: true, data: { result: a + b } });
  } catch (err) {
    if (err instanceof MythosError) return Response.json({ success: false, code: err.code }, { status: err.httpStatus });
    throw err;
  }
}
```

## 5. Page
```tsx
'use client';
import { useMythos } from '@mythos-work/sdk/react';

export default function Calculator() {
  const { status, session, fetch, confirmCharge, relaunch } = useMythos();
  if (status === 'loading') return <p>Loading…</p>;
  if (status === 'standalone') return <p>Open this app from Mythos.</p>;
  if (status === 'expired') return <button onClick={relaunch}>Session expired — relaunch</button>;
  if (status === 'error') return <p>Something went wrong.</p>;

  async function calculate() {
    const { approved } = await confirmCharge({ credits: 1, reason: '1 + 2' });
    if (approved) await fetch('/api/calculate', { method: 'POST', body: JSON.stringify({ a: 1, b: 2 }) });
  }
  return <button onClick={calculate}>Hi {session?.displayName} — calculate (1 credit)</button>;
}
```

## Check it
```bash
npx @mythos-work/sdk doctor
```
Then launch your listing from the Mythos dashboard.
