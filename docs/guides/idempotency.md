# Idempotency

Prevent double-billing when users retry or double-click billable actions.

{% hint style="info" %}
**Related:** [Usage metering](../concepts/usage-metering.md) · [reportUsage](../reference/node/report-usage.md)
{% endhint %}

## How charge_id works today

Each `reportUsage` / `report_usage` call sends a `charge_id` to Mythos `/meter`. The SDK generates a **fresh UUID** on every call:

```typescript
// Internal behavior — SDK generates charge_id automatically
await reportUsage(sessionJti, { credits: 1, reason: 'post' });
```

If the user double-clicks a billable button, two calls produce two different `charge_id` values and **two charges**.

## App-level deduplication

Prevent duplicate calls before they reach the SDK:

```typescript
let billingInFlight = false;

async function onGeneratePost() {
  if (billingInFlight) return;
  billingInFlight = true;
  try {
    await generatePost();
    await reportMythosUsage(1, 'instagram-post');
  } finally {
    billingInFlight = false;
  }
}
```

Disable the button after first click. Use a per-action ID (post ID, request ID) as a client-side dedup key.

## Caller-supplied charge_id (upcoming)

A future SDK release will accept an optional idempotency key so retries send the same `charge_id`:

```typescript
// Coming soon — same chargeId on retry dedupes at the backend
await reportUsage(sessionJti, { credits: 1, reason: 'post', chargeId: postId });
```

```python
# Coming soon
await report_usage(session.sessionJti, credits=1, reason="post", charge_id=post_id)
```

Generate the key **once per billable action**, not per HTTP retry. Use a stable identifier tied to the action (e.g. generated post UUID), not a random value per click.

## Backend SQS dedup

Mythos uses `charge_id` for SQS metering job deduplication. Same `charge_id` + same session = one debit. Different `charge_id` = separate charges.

## Next steps

- [Usage metering](../concepts/usage-metering.md)
- [reportUsage](../reference/node/report-usage.md)
- [Troubleshooting](../resources/troubleshooting.md)
