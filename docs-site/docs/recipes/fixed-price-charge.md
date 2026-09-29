# Fixed-price charge

Confirm the price in the browser before starting a fixed-price action.

```ts
const idempotencyKey = crypto.randomUUID();
const { approved, consentId } = await confirmCharge({ credits: 2, reason: 'export' });
if (approved) await fetch('/api/export', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idempotencyKey, consentId }),
});
```

Send the same client-generated UUID and consent ID to the server. Reuse the UUID whenever the client retries the same action so retries never double-charge.

```ts
const { idempotencyKey, consentId } = await req.json();
await mythos.charge(req, { credits: 2, reason: 'export', idempotencyKey, consentId });
```
