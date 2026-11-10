# Usage metering

Bill a Consumer only after they approve the price and the server performs the billable action.

## Fixed-price flow

1. The browser calls `confirmCharge({ usd: 0.15, reason })`.
2. If `approved` is true, the browser sends the action through the SDK's session-aware `fetch`.
3. The server calls `mythos.charge(req, { usd: 0.15, reason, idempotencyKey, consentId })` with the same amount.
4. Mythos converts USD to credits on the server; the SDK returns `chargeId`, `sessionMeteredTotal` and `creditsCharged` (Python: `credits_charged`).

```ts
const { approved, consentId } = await confirmCharge({ usd: 0.15, reason: 'calculate' });
if (approved) await fetch('/api/calculate', {
  method: 'POST',
  body: JSON.stringify({ consentId }),
});
```

```ts
await mythos.charge(req, { usd: 0.15, reason: 'calculate', consentId });
```

Alternatively, use `credits: 1500` directly in both calls; credits must be integers. USD accepts positive numbers or exact decimal strings with at most 4 decimal places (Python also accepts `Decimal`). Computed floats are rejected, never rounded: round first or pass a string. The popup shows credits using the session rate; USD confirmation without that rate rejects with `USD_RATE_UNAVAILABLE`. Use a stable, client-generated `idempotencyKey` for retries of the same action; see [Fixed-price charge](../recipes/fixed-price-charge.md).

## LLM billing

Use `mythos.llm` to route an OpenAI client through the Mythos gateway, then inspect the completion with `mythos.billing`. See [LLM chat](../recipes/llm-chat.md).
