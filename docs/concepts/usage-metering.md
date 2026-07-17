# Usage metering

Debit the Consumer's Mythos wallet after successful billable actions.

{% hint style="info" %}
**Just getting started?** See [reportUsage](../reference/node/report-usage.md) API reference.
{% endhint %}

## When to call reportUsage

Call `reportUsage` / `report_usage` **after** the billable action succeeds — not before. Examples:

| Action | Reason string example |
|--------|----------------------|
| Generate Instagram post | `instagram-post` |
| Run analysis | `run-complete` |
| Calculator operation | `calculator:multiply` |
| Page view (if billed) | `page-view` |

Use a stable, descriptive `reason` for support and analytics. It is optional but recommended.

## Server vs frontend

**Recommended:** Expose `POST /api/mythos/report-usage` on your server and call it from the frontend after success. This keeps metering logic centralized and avoids exposing session details.

```typescript
// Frontend — non-fatal
try {
  await fetch('/api/mythos/report-usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionJti, credits: 1, reason: 'post-generated' }),
  });
} catch {
  // Log only — never block the user flow
}
```

You can also call `reportUsage` directly in server route handlers when the billable action runs server-side.

## HTTP mapping

| SDK error / response | HTTP status | Meaning |
|---------------------|-------------|---------|
| Success | 200 | Wallet debited |
| `InsufficientFundsError` | 402 | Consumer has no credits |
| `SessionNotFoundError` | 404 | Invalid or expired sessionJti |
| Other / network | 503 | Mythos API unreachable |

## Credits

Pass the number of credits to debit per action. Your listing defines the price; the SDK sends the amount to Mythos `/meter`.

```typescript
await reportUsage(sessionJti, { credits: 1, reason: 'page-view' });
```

```python
await report_usage(session.sessionJti, credits=1, reason="page-view")
```

## Non-fatal on frontend

{% hint style="warning" %}
Never block the user's main flow because billing failed. Catch errors in frontend report calls, log them, and continue. The Consumer already received the service; billing failures are operational issues to retry or reconcile separately.
{% endhint %}

## Idempotency

Each `reportUsage` call generates a fresh `charge_id` UUID internally. Double-clicking a billable button can produce two charges. See [Idempotency](../guides/idempotency.md) for dedup patterns.

## Next steps

- [reportUsage](../reference/node/report-usage.md) · [report_usage](../reference/python/report-usage.md)
- [Required routes](../guides/required-routes.md) — report-usage request body
- [Idempotency](../guides/idempotency.md)
