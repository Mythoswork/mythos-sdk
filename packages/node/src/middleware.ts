import type { RequestHandler } from 'express';
import { errors } from 'jose';
import { verifyLaunchToken } from './verify';
import { consumeSession } from './api-client';
import { extractLaunchToken } from './query';
import { InvalidLaunchTokenError, MythosConfigError } from './errors';
import type { MythosSession } from './types';

function readIdentityFields(body: unknown): Pick<MythosSession, 'llmIdentityToken' | 'llmIdentityExpiresAt'> | null {
  if (!body || typeof body !== 'object') return null;
  const data = (body as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;

  const token = (data as { llm_identity_token?: unknown }).llm_identity_token;
  if (typeof token !== 'string' || token.length === 0) return null;

  const expiresAt = (data as { llm_identity_expires_at?: unknown }).llm_identity_expires_at;
  return {
    llmIdentityToken: token,
    ...(typeof expiresAt === 'string' ? { llmIdentityExpiresAt: expiresAt } : {}),
  };
}

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

    let consumeRes: Response;
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
