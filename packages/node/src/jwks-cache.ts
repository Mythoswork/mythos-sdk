import { createLocalJWKSet, type JSONWebKeySet } from 'jose';
import { mythosRequest } from './http';

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  keySet: ReturnType<typeof createLocalJWKSet>;
  fetchedAt: number;
}

const _cache = new Map<string, CacheEntry>();

function isStale(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS;
}

async function fetchJwks(apiUrl: string): Promise<ReturnType<typeof createLocalJWKSet>> {
  const res = await mythosRequest(`${apiUrl}/.well-known/jwks.json`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`JWKS fetch failed: ${res.status}`);
  }
  const jwks = (await res.json()) as JSONWebKeySet;
  const keySet = createLocalJWKSet(jwks);
  _cache.set(apiUrl, { keySet, fetchedAt: Date.now() });
  return keySet;
}

export async function getKeySet(apiUrl: string, forceRefresh = false): Promise<ReturnType<typeof createLocalJWKSet>> {
  const cached = _cache.get(apiUrl);
  if (!forceRefresh && cached && !isStale(cached)) {
    return cached.keySet;
  }
  return fetchJwks(apiUrl);
}

export async function getKeySetWithKidFallback(apiUrl: string): Promise<ReturnType<typeof createLocalJWKSet>> {
  return getKeySet(apiUrl, true);
}

export function clearCache(): void {
  _cache.clear();
}
