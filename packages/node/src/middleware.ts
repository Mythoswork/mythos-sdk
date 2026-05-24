import type { RequestHandler } from 'express';
import { verifyLaunchToken } from './verify';
import { consumeSession } from './api-client';

export function requireLaunchToken(): RequestHandler {
  return async (req, res, next) => {
    const token = req.query['lt'] as string | undefined;
    if (!token) {
      res.status(401).json({ error: 'Missing launch token' });
      return;
    }

    let session;
    try {
      session = await verifyLaunchToken(token);
    } catch {
      res.status(401).json({ error: 'Invalid launch token' });
      return;
    }

    const consumeRes = await consumeSession(session.sessionJti);
    if (consumeRes.status === 409) {
      res.status(401).json({ error: 'Token already consumed' });
      return;
    }

    req.mythos = session;
    next();
  };
}
