import type { RequestHandler } from 'express';
import { errors } from 'jose';
import { verifyLaunchToken } from './verify';
import { consumeSession, readIdentityFields } from './api-client';
import { extractLaunchToken } from './query';
import { InvalidLaunchTokenError, MythosConfigError } from './errors';
import { mythosLog } from './logger';

export function requireLaunchToken(options?: {
  resolveListingIds?: () => Promise<string[]>;
}): RequestHandler {
  return async (req, res, next) => {
    const token = extractLaunchToken(req.query['lt']);
    if (!token) {
      res.status(401).json({ error: 'Missing launch token' });
      return;
    }

    let session;
    try {
      session = await verifyLaunchToken(token, options);
    } catch (err) {
      if (err instanceof MythosConfigError) {
        mythosLog.error('requireLaunchToken: invalid configuration', err);
        res.status(500).json({ error: err.message });
        return;
      }
      if (err instanceof InvalidLaunchTokenError || err instanceof errors.JOSEError) {
        res.status(401).json({ error: 'Invalid launch token' });
        return;
      }
      mythosLog.error('requireLaunchToken: launch token verification failed', err);
      res.status(503).json({ error: 'Could not verify session' });
      return;
    }

    let consumeRes: Response;
    try {
      consumeRes = await consumeSession(session.sessionJti);
    } catch (err) {
      mythosLog.error('requireLaunchToken: consume request failed', err);
      res.status(503).json({ error: 'Could not verify session' });
      return;
    }
    if (consumeRes.status === 409) {
      res.status(401).json({ error: 'Token already consumed' });
      return;
    }
    if (consumeRes.status < 200 || consumeRes.status >= 300) {
      mythosLog.error(`requireLaunchToken: consume returned ${consumeRes.status}`);
      res.status(503).json({ error: 'Could not verify session' });
      return;
    }

    let consumeBody: unknown = null;
    try {
      consumeBody = await consumeRes.json();
    } catch {
      // Identity fields are optional for SDK compatibility; session verification already succeeded.
    }

    req.mythos = { ...session, ...(readIdentityFields(consumeBody) ?? {}) };
    next();
  };
}
