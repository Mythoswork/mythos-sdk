import { loadConfig } from './config';

export const MYTHOS_HTTP_TIMEOUT_MS = 5_000;

const { apiUrl } = loadConfig();

export function mythosRequest(url: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiUrl}${url}`, { ...init, signal: AbortSignal.timeout(MYTHOS_HTTP_TIMEOUT_MS) });
}
