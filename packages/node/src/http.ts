export const MYTHOS_HTTP_TIMEOUT_MS = 5_000;

export function mythosRequest(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(MYTHOS_HTTP_TIMEOUT_MS) });
}
