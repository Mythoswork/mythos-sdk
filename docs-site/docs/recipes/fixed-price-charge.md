# Fixed-price charge

Confirm the price in the browser before starting a fixed-price action.

```ts
const idempotencyKey = crypto.randomUUID();
const { approved, consentId } = await confirmCharge({ usd: 0.15, reason: 'export' });
if (approved) await fetch('/api/export', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idempotencyKey, consentId }),
});
```

Send the same client-generated UUID and consent ID to the server. Reuse the UUID whenever the client retries the same action so retries never double-charge.

```ts
const { idempotencyKey, consentId } = await req.json();
const meter = await mythos.charge(req, { usd: 0.15, reason: 'export', idempotencyKey, consentId });
// meter.creditsCharged is the resolved credit amount.
```

Use the same amount for confirmation and charging, or `credits: 1500` directly in both. USD accepts a positive number or exact decimal string with at most 4 decimal places; Python also accepts `Decimal` and uses `usd=0.15`. Numbers are never rounded: `0.1 + 0.2` is rejected, so round first with `Number(x.toFixed(2))` / `round(x, 2)`, or pass a string.

The popup shows credits using the `initMythos` / `useMythos` session rate; an absent rate rejects with `USD_RATE_UNAVAILABLE`. Mythos converts USD to credits on the server. Standalone client confirmation accepts credits only.
