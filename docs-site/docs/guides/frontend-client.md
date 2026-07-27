# Frontend client

Handle `?lt=` on page load, exchange for a session, and report usage after billable actions.

## Integration steps

1. On app load, read `lt` from `window.location.search`
2. If present, `fetch('/api/mythos/session?lt=' + encodeURIComponent(lt))`
3. On `200`, store `sessionJti` (and user info if needed)
4. Always `history.replaceState` to remove `lt` from the URL — even on failure
5. After a **successful** billable action, `POST /api/mythos/report-usage`

If no `?lt=` param, the app behaves exactly as before — Mythos is optional at runtime.

## TypeScript client

```typescript
export async function initMythosFromUrl(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const lt = params.get('lt');
  if (!lt) return;

  try {
    const res = await fetch(`/api/mythos/session?lt=${encodeURIComponent(lt)}`);
    if (res.ok) {
      const data = await res.json();
      // Support wrapped { session } or flat response (Python style)
      session = data.session ?? data;
    }
  } catch {
    // Not launched from Mythos — fall back to normal auth
  } finally {
    params.delete('lt');
    const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
    window.history.replaceState({}, '', clean);
  }
}
```

## Session JSON shapes

Your server may return either format. The client above handles both:

| Style | Example |
|-------|---------|
| Wrapped (Node) | `{ "ok": true, "session": { "sessionJti": "..." } }` |
| Flat (Python) | `{ "sessionJti": "...", "userId": "..." }` |

## Usage reporting

```typescript
export async function reportMythosUsage(credits: number, reason?: string): Promise<void> {
  if (!session) return;
  try {
    await fetch('/api/mythos/report-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionJti: session.sessionJti, credits, reason }),
    });
  } catch {
    // Non-fatal — never block the user flow
  }
}
```

## Iframe handshake

If your app runs inside a Mythos iframe, post a message after successful session exchange:

```javascript
if (d.success) {
  window.parent.postMessage({ type: 'mythos:handshake' }, '*');
}
```

## Wiring to existing auth

See [Auth patterns](auth-patterns.md) for password gates, OAuth, and no-auth setups.

## Next steps

- [Auth patterns](auth-patterns.md)
- [Usage metering](../concepts/usage-metering.md)
- [Code examples](../resources/code-examples.md)
