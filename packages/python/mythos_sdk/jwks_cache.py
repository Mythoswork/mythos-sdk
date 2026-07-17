import time
from typing import Any
from urllib.parse import quote

from .http import get_http_client

CACHE_TTL = 600  # 10 minutes

_cache_by_url: dict[str, dict[str, Any]] = {}
_fetched_at_by_url: dict[str, float] = {}


def _is_stale(api_url: str) -> bool:
    fetched_at = _fetched_at_by_url.get(api_url)
    if fetched_at is None:
        return True
    return time.monotonic() - fetched_at > CACHE_TTL


async def _fetch_jwks(api_url: str) -> dict[str, Any]:
    client = get_http_client()
    resp = await client.get(f"{api_url}/.well-known/jwks.json")
    resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    _cache_by_url[api_url] = data
    _fetched_at_by_url[api_url] = time.monotonic()
    return data


async def get_jwks(api_url: str, force_refresh: bool = False) -> dict[str, Any]:
    cached = _cache_by_url.get(api_url)
    if not force_refresh and cached is not None and not _is_stale(api_url):
        return cached
    return await _fetch_jwks(api_url)


async def get_jwks_with_kid_fallback(api_url: str) -> dict[str, Any]:
    return await get_jwks(api_url, force_refresh=True)


def clear_cache() -> None:
    _cache_by_url.clear()
    _fetched_at_by_url.clear()
