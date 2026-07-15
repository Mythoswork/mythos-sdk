import type { RequestHandler } from 'express';
import { errors } from 'jose';
import { verifyLaunchToken } from './verify';
import { consumeSession } from './api-client';
import { extractLaunchToken } from './query';
import { InvalidLaunchTokenError, MythosConfigError } from './errors';

export function requireLaunchToken(): RequestHandler {
  return async (req, res, next) => {
    const token = extractLaunchToken(req.query['lt']);
    if (!token) {
      res.status(401).json({ error: 'Missing launch token' });
      return;
    }

    let session;
    try {
      session = await verifyLaunchToken(token);
    } catch (err) {
      if (err instanceof MythosConfigError) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (err instanceof InvalidLaunchTokenError || err instanceof errors.JOSEError) {
        res.status(401).json({ error: 'Invalid launch token' });
        return;
      }
      res.status(503).json({ error: 'Could not verify session' });
      return;
    }

    let consumeRes: { status: number };
    try {
      consumeRes = await consumeSession(session.sessionJti);
    } catch {
      res.status(503).json({ error: 'Could not verify session' });
      return;
    }
    if (consumeRes.status === 409) {
      res.status(401).json({ error: 'Token already consumed' });
      return;
    }
    if (consumeRes.status < 200 || consumeRes.status >= 300) {
      res.status(503).json({ error: 'Could not verify session' });
      return;
    }

    req.mythos = session;
    next();
  };
}
