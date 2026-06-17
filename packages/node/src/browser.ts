import { MythosError } from './errors';

export { MythosError, InsufficientFundsError, SessionNotFoundError } from './errors';
export type { MythosSession } from './types';

function notImplemented(name: string): never {
  throw new MythosError(`${name} is not available in browser environments`, 'NOT_IMPLEMENTED');
}

export function verifyLaunchToken(_token: string): Promise<never> {
  return notImplemented('verifyLaunchToken');
}

export function requireLaunchToken(): never {
  return notImplemented('requireLaunchToken');
}

export function reportUsage(): Promise<never> {
  return notImplemented('reportUsage');
}

export function handshakeRoute(): never {
  return notImplemented('handshakeRoute');
}
