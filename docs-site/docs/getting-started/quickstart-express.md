---
title: Quickstart — Express
sidebar_label: Express
---

Zero to a billed charge in 5 steps.

## 1. Install and scaffold
```bash
npm i @mythos-work/sdk express
npx @mythos-work/sdk init
```

## 2. Environment
```bash
# .env
MYTHOS_LISTING_ID=your-listing-id
MYTHOS_SESSION_SECRET=                     # openssl rand -base64 32  (≥ 32 chars)
```
Node does not read `.env` on its own — step 5 starts the server with `--env-file`. In production, set these in your host's environment instead.

## 3. Server
```ts
// server.ts
import express from 'express';
import { createMythos, MythosError } from '@mythos-work/sdk';
import { mythosExpress } from '@mythos-work/sdk/express';

const app = express();
const mythos = createMythos();
app.use(express.json());
app.use(mythosExpress(mythos));
app.post('/api/calculate', async (req, res, next) => {
  try {
    await mythos.charge(req, { credits: 1, reason: 'calculate' });
    res.json({ success: true, data: { result: req.body.a + req.body.b } });
  } catch (err) {
    if (err instanceof MythosError) return res.status(err.httpStatus).json({ success: false, error: err.message, code: err.code });
    next(err);
  }
});
app.listen(3000);
```

## 4. Page
```html
<button onclick="calculate()">Calculate (1 credit)</button>
<script src="https://cdn.jsdelivr.net/npm/@mythos-work/sdk@0.3.0/dist/mythos-client.global.js"></script>
<script>
  const m = Mythos.initMythos();
  m.ready.then((s) => { document.body.dataset.mythos = s.status; });
  async function calculate() {
    const { approved } = await m.confirmCharge({ credits: 1, reason: '1 + 2' });
    if (approved) await m.fetch('/api/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1, b: 2 }) });
  }
</script>
```

## 5. Run and check it
```bash
node --env-file=.env server.js   # Node ≥ 20.6 (compile server.ts first, or use tsx --env-file=.env server.ts)
npx @mythos-work/sdk doctor
```
Already using `dotenv`? `import 'dotenv/config'` at the top of `server.ts` works too.
Then launch your listing from the Mythos dashboard.
