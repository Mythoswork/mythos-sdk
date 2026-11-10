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
# openssl rand -base64 32  (≥ 32 chars)
MYTHOS_SESSION_SECRET=
# Mythos dashboard → Settings → Mythos key
MYTHOS_KEY=
```
Node does not read `.env` on its own — step 5 starts the server with `--env-file`. In production, set these in your host's environment instead.

## 3. Server
Missing `MYTHOS_KEY` is soft; static listing launches remain silent, while dynamic registration, handshake and callbacks warn once per process. It will be required in a future release. Update deployment env after key regeneration. See the [binding matrix](../reference/configuration.md).

| Troubleshooting code | Fix |
|---|---|
| `PRODUCER_MISMATCH` | The `MYTHOS_KEY` in this deployment belongs to a different Producer, or was regenerated. Copy the current key from the dashboard and redeploy. |

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
    await mythos.charge(req, { usd: 0.15, reason: 'calculate', consentId: req.body.consentId });
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
<button onclick="calculate()">Calculate ($0.15)</button>
<script src="https://cdn.jsdelivr.net/npm/@mythos-work/sdk@0.6.0/dist/mythos-client.global.js"></script>
<script>
  const m = Mythos.initMythos();
  m.ready.then((s) => { document.body.dataset.mythos = s.status; });
  async function calculate() {
    const { approved, consentId } = await m.confirmCharge({ usd: 0.15, reason: 'calculate' });
    if (approved) await m.fetch('/api/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1, b: 2, consentId }) });
  }
</script>
```

The popup shows credits using the session rate; the server charges the same USD amount. Alternatively, use `credits: 1500` directly in both calls. USD accepts numbers or exact decimal strings; see [USD confirmation](./browser-client.md#confirm-a-usd-charge) for validation and missing-rate errors.

## 5. Run and check it
```bash
node --env-file=.env server.js   # Node ≥ 20.6 (compile server.ts first, or use tsx --env-file=.env server.ts)
npx @mythos-work/sdk doctor
```
Already using `dotenv`? `import 'dotenv/config'` at the top of `server.ts` works too.
Then launch your listing from the Mythos dashboard.
