# Express

Full Express integration guide for the Mythos SDK.

## Install

```bash
npm install @mythos/sdk express
```

## Mount all routes

```typescript
import express from 'express';
import {
  handshakeRoute,
  listingCallbackRoute,
  requireLaunchToken,
  reportUsage,
  MythosError,
} from '@mythos/sdk';

const app = express();
app.use(express.json());

// Handshake — handshakeRoute() is a bare handler with no path matching of
// its own, so it must be mounted at the exact path
app.use('/.well-known/mythos-handshake', handshakeRoute());

// Optional: dynamic listing IDs
const listingIds: string[] = [];
app.use(
  '/.well-known/mythos-listing-registered',
  listingCallbackRoute(async (id) => {
    if (!listingIds.includes(id)) listingIds.push(id);
  }),
);

const resolveListingIds = async () => listingIds;

app.get('/api/mythos/session', requireLaunchToken({ resolveListingIds }), (req, res) => {
  res.json({ ok: true, session: req.mythos });
});

app.post('/api/mythos/report-usage', async (req, res) => {
  const { sessionJti, credits, reason } = req.body ?? {};
  if (!sessionJti || typeof credits !== 'number') {
    res.status(400).json({ error: 'sessionJti and credits are required' });
    return;
  }
  try {
    await reportUsage(sessionJti, { credits, reason });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof MythosError) {
      const status = err.code === 'SESSION_NOT_FOUND' ? 404 : 402;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    res.status(503).json({ error: 'Failed to report usage' });
  }
});
```

## Reusable mount helper

Wrap the routes above in a `mountMythosRoutes(app)` helper if you prefer a single drop-in for an existing Express app:

```typescript
export function mountMythosRoutes(app: express.Application): void {
  app.use('/.well-known/mythos-handshake', handshakeRoute());

  app.get('/api/mythos/session', requireLaunchToken(), (req, res) => {
    res.json({ ok: true, session: req.mythos });
  });

  app.post('/api/mythos/report-usage', express.json(), async (req, res) => {
    const { sessionJti, credits, reason } = req.body ?? {};
    if (!sessionJti || typeof credits !== 'number') {
      res.status(400).json({ error: 'sessionJti and credits are required' });
      return;
    }
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
}
```

## Environment

```env
MYTHOS_LISTING_ID=<listing-id>
# MYTHOS_API_URL=https://api.mythos.work
```

## Error handling

| Error | HTTP | Action |
|-------|------|--------|
| `InsufficientFundsError` | 402 | Show "insufficient credits" to user |
| `SessionNotFoundError` | 404 | Session expired — re-launch from Mythos |
| Other | 503 | Log and retry |

## Next steps

- [Frontend client](frontend-client.md)
- [Vercel serverless](vercel-serverless.md)
- [Verify your integration](../getting-started/verify-integration.md)
