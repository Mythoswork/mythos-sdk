import { MythosError } from './errors';
import type { CreateMythosOptions } from './mythos';

export {
  MythosError,
  MythosConfigError,
  InvalidLaunchTokenError,
  InsufficientFundsError,
  SessionNotFoundError,
  InvalidUsageError,
  SessionRequiredError,
  SessionExpiredError,
  LaunchTokenConsumedError,
  MythosUpstreamError,
  MythosUnreachableError,
} from './errors';
export type { MythosSession } from './types';
export type {
  Mythos,
  CreateMythosOptions,
  PublicSession,
  ChargeOptions,
  ChargeResult,
  MythosRequestLike,
} from './mythos';
export type { MeterResult } from './api-client';

function notImplemented(name: string): never {
  throw new MythosError(`${name} is not available in browser environments`, 'NOT_IMPLEMENTED');
}

export async function verifyLaunchToken(_token: string): Promise<never> {
  return notImplemented('verifyLaunchToken');
}

export function requireLaunchToken(): never {
  return notImplemented('requireLaunchToken');
}

export async function reportUsage(): Promise<never> {
  return notImplemented('reportUsage');
}

export function handshakeRoute(): never {
  return notImplemented('handshakeRoute');
}

export function createMythos(_options?: CreateMythosOptions): never {
  throw new MythosError('createMythos is server-only', 'NOT_IMPLEMENTED');
}
