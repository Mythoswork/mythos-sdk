import { randomUUID } from 'crypto';
import { mythosRequest } from './http';
import {
  InsufficientFundsError,
  InvalidUsageError,
  MythosUnreachableError,
  MythosUpstreamError,
  SessionExpiredError,
  SessionNotFoundError,
} from './errors';
import type { MythosSession } from './types';

function encodeJti(jti: string): string {
  return encodeURIComponent(jti);
}

function validateCredits(credits: number): void {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new InvalidUsageError('credits must be a positive integer');
  }
}

async function post(path: string, body: unknown): Promise<Response> {
  return mythosRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    if (isRecord(body) && typeof body['code'] === 'string') return body['code'];
  } catch {
    // A non-JSON error response has no machine-readable code.
  }
  return undefined;
}

export interface MeterResult {
  chargeId: string;
  sessionMeteredTotal: number | null;
}

export function readIdentityFields(
  body: unknown,
): Pick<MythosSession, 'llmIdentityToken' | 'llmIdentityExpiresAt'> | null {
  if (!isRecord(body) || !isRecord(body['data'])) return null;
  const token = body['data']['llm_identity_token'];
  if (typeof token !== 'string' || token.length === 0) return null;
  const expiresAt = body['data']['llm_identity_expires_at'];
  return {
    llmIdentityToken: token,
    ...(typeof expiresAt === 'string' ? { llmIdentityExpiresAt: expiresAt } : {}),
  };
}

export async function consumeSession(jti: string): Promise<Response> {
  return post(`/api/apps/sessions/${encodeJti(jti)}/consume`, {});
}

export async function meterSession(
  jti: string,
  credits: number,
  reason?: string,
  chargeId?: string,
): Promise<MeterResult> {
  validateCredits(credits);
  const resolvedChargeId = chargeId ?? randomUUID();

  const body: Record<string, unknown> = {
    credits,
    charge_id: resolvedChargeId,
  };
  if (reason !== undefined) {
    body.reason = reason;
  }

  let res: Response;
  try {
    res = await post(`/api/apps/sessions/${encodeJti(jti)}/meter`, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new MythosUnreachableError(`Could not reach Mythos API: ${message}`);
  }

  if (res.status === 402) throw new InsufficientFundsError();
  if (!res.ok) {
    const code = await readErrorCode(res);
    if (code === 'SESSION_EXPIRED' || code === 'SESSION_NOT_STARTED') throw new SessionExpiredError();
    if (res.status === 404) throw new SessionNotFoundError(jti);
    throw new MythosUpstreamError('Meter request failed', res.status, code);
  }

  let responseBody: unknown;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = null;
  }
  const data = isRecord(responseBody) && isRecord(responseBody['data']) ? responseBody['data'] : null;
  const total = data?.['session_metered_total'];
  return {
    chargeId: resolvedChargeId,
    sessionMeteredTotal: typeof total === 'number' && Number.isSafeInteger(total) ? total : null,
  };
}
