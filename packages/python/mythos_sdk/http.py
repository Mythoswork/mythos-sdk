import httpx

MYTHOS_HTTP_TIMEOUT = 5.0

_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=MYTHOS_HTTP_TIMEOUT)
    return _client
