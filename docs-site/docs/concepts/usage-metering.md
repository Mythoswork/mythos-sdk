# Usage metering

Bill a Consumer only after they approve the price and the server performs the billable action.

## Fixed-price flow

1. The browser calls `confirmCharge({ credits, reason })`.
2. If `approved` is true, the browser sends the action through the SDK's session-aware `fetch`.
3. The server calls `mythos.charge(req, { credits, reason, idempotencyKey, consentId })`.
4. The SDK returns `chargeId` and `sessionMeteredTotal`.

```ts
const { approved, consentId } = await confirmCharge({ credits: 1, reason: 'calculate' });
if (approved) await fetch('/api/calculate', {
  method: 'POST',
  body: JSON.stringify({ consentId }),
});
```

```ts
await mythos.charge(req, { credits: 1, reason: 'calculate', consentId });
```

Credits must be integers. Use a stable, client-generated `idempotencyKey` for retries of the same action; see [Fixed-price charge](../recipes/fixed-price-charge.md).

## LLM billing

Use `mythos.llm` to route an OpenAI client through the Mythos gateway, then inspect the completion with `mythos.billing`. See [LLM chat](../recipes/llm-chat.md).
