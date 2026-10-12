import { decodeJwt } from 'jose';

import { DIAGNOSTIC_TIMEOUT_MS, isDiagnosticCode, type DiagnosticCode, type DiagnosticStep } from './constants/diagnostics.constants';
import { MythosError } from './errors';
import { mythosRequest } from './http';
import { mythosLog } from './logger';
import type { StoredSession } from './session';
import { SDK_VERSION } from './version';

export type { DiagnosticCode, DiagnosticStep } from './constants/diagnostics.constants';

export function readTestJti(token: string): string | undefined {
  try {
    const payload = decodeJwt(token);
    return payload.test === true && typeof payload.jti === 'string' ? payload.jti : undefined;
  } catch {
    return undefined;
  }
}

async function sendDiagnostic(jti: string, code: DiagnosticCode, step: DiagnosticStep): Promise<void> {
  try {
    await mythosRequest(`/api/apps/sessions/${encodeURIComponent(jti)}/diagnostics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, step, sdk_version: SDK_VERSION }),
    }, DIAGNOSTIC_TIMEOUT_MS);
  } catch {
    mythosLog.debug('diagnostics: report failed');
  }
}

export function reportDiagnostic(jti: string, code: DiagnosticCode, step: DiagnosticStep): void {
  void sendDiagnostic(jti, code, step);
}

export function reportLaunchFailure(token: string, code: DiagnosticCode, step: DiagnosticStep): void {
  const jti = readTestJti(token);
  if (jti !== undefined) reportDiagnostic(jti, code, step);
}

export function reportSessionFailure(session: StoredSession, error: unknown, step: DiagnosticStep): void {
  if (session.isTest === true && error instanceof MythosError && isDiagnosticCode(error.code)) {
    reportDiagnostic(session.sessionJti, error.code, step);
  }
}
