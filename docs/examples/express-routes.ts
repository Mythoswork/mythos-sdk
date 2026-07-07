/**
 * Express route stubs for Mythos SDK — wire into your Express app.
 *
 * Env required:
 *   MYTHOS_LISTING_ID=<your-listing-id>
 */
import express from 'express';
import { handshakeRoute, requireLaunchToken, reportUsage, MythosError } from '@mythos/sdk';

export function mountMythosRoutes(app: express.Application): void {
  app.get('/.well-known/mythos-handshake', handshakeRoute());

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
