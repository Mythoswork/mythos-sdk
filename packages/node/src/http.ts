import { loadConfig } from './config';

export const MYTHOS_HTTP_TIMEOUT_MS = 5_000;

export function mythosFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(MYTHOS_HTTP_TIMEOUT_MS) });
}

export async function mythosPost(path: string, body: unknown): Promise<Response> {
  const { apiUrl } = loadConfig();
  return mythosFetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
