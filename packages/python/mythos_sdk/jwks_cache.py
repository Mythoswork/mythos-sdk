import time
from typing import Any

import httpx

CACHE_TTL = 600  # 10 minutes

_cache: dict[str, Any] | None = None
_fetched_at: float = 0.0


def _is_stale() -> bool:
    return _cache is None or time.monotonic() - _fetched_at > CACHE_TTL


async def _fetch_jwks(api_url: str) -> dict[str, Any]:
    global _cache, _fetched_at
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{api_url}/.well-known/jwks.json")
        resp.raise_for_status()
    _cache = resp.json()
    _fetched_at = time.monotonic()
    return _cache  # type: ignore[return-value]


async def get_jwks(api_url: str, force_refresh: bool = False) -> dict[str, Any]:
    if not force_refresh and not _is_stale() and _cache is not None:
        return _cache
    return await _fetch_jwks(api_url)


async def get_jwks_with_kid_fallback(api_url: str) -> dict[str, Any]:
    return await get_jwks(api_url, force_refresh=True)


def clear_cache() -> None:
    global _cache, _fetched_at
    _cache = None
    _fetched_at = 0.0
