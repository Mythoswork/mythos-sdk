# Quickstart: Node.js

Wire the Mythos SDK into an Express app in under 10 minutes.

:::info
**Prerequisites:** [Install the SDK](install.md) and set `MYTHOS_LISTING_ID` in `.env`.
:::

## 1. Install

```bash
npm install @mythos-work/sdk express
```

## 2. Server routes

```typescript
import express from 'express';
import {
  handshakeRoute,
  requireLaunchToken,
  reportUsage,
  MythosError,
} from '@mythos-work/sdk';

const app = express();
app.use(express.json());

// Publish handshake — mount the Router returned by handshakeRoute()
app.use(handshakeRoute());

// Session exchange for frontend ?lt= handling
app.get('/api/mythos/session', requireLaunchToken(), (req, res) => {
  res.json({ ok: true, session: req.mythos });
});

// Usage reporting after billable actions
app.post('/api/mythos/report-usage', async (req, res) => {
  const { sessionJti, credits, reason } = req.body ?? {};
  try {
    await reportUsage(sessionJti, { credits, reason });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof MythosError) {
      res.status(402).json({ error: err.message, code: err.code });
      return;
    }
    res.status(503).json({ error: 'Failed to report usage' });
  }
});

app.listen(8080);
```

:::warning
Use `app.use(handshakeRoute())` — not `app.get('/.well-known/...', handshakeRoute())`. `handshakeRoute()` returns an Express `Router` with the route already defined.
:::

## 3. Frontend (minimal)

On page load, exchange `?lt=` for a session:

```typescript
const params = new URLSearchParams(window.location.search);
const lt = params.get('lt');
if (lt) {
  const res = await fetch(`/api/mythos/session?lt=${encodeURIComponent(lt)}`);
  if (res.ok) {
    const { session } = await res.json();
    // store session.sessionJti for billing
  }
  params.delete('lt');
  history.replaceState({}, '', window.location.pathname);
}
```

See [Frontend client](../guides/frontend-client.md) for the full client stub.

## 4. Verify

```bash
curl.exe -i http://127.0.0.1:8080/.well-known/mythos-handshake
# → 401 {"error":"Missing launch token"}
```

More checks: [Verify your integration](verify-integration.md).

## What you built

| Route | Purpose |
|-------|---------|
| `GET /.well-known/mythos-handshake?lt=` | Publish gate |
| `GET /api/mythos/session?lt=` | Verify + consume launch token |
| `POST /api/mythos/report-usage` | Debit Consumer wallet |

## Next steps

- [Express guide](../guides/express.md) — production patterns and error handling
- [Next.js](../guides/nextjs.md) — App Router shim
- [AI integration prompt](../guides/ai-integration-prompt.md) — full agent brief
