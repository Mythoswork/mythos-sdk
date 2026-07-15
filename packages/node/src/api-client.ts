import { randomUUID } from 'crypto';
import { loadConfig } from './config';
import { mythosRequest } from './http';
import { InsufficientFundsError, InvalidUsageError, SessionNotFoundError } from './errors';

function encodeJti(jti: string): string {
  return encodeURIComponent(jti);
}

function validateCredits(credits: number): void {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new InvalidUsageError('credits must be a positive integer');
  }
}

async function post(path: string, body: unknown): Promise<Response> {
  const { apiUrl } = loadConfig();
  return mythosRequest(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function consumeSession(jti: string): Promise<Response> {
  return post(`/api/apps/sessions/${encodeJti(jti)}/consume`, {});
}

export async function meterSession(
  jti: string,
  credits: number,
  reason?: string,
  chargeId?: string,
): Promise<void> {
  validateCredits(credits);

  const body: Record<string, unknown> = {
    credits,
    charge_id: chargeId ?? randomUUID(),
  };
  if (reason !== undefined) {
    body.reason = reason;
  }

  const res = await post(`/api/apps/sessions/${encodeJti(jti)}/meter`, body);

  if (res.status === 402) throw new InsufficientFundsError();
  if (res.status === 404) throw new SessionNotFoundError(jti);
  if (!res.ok) throw new Error(`Meter request failed: ${res.status}`);
}
