from unittest.mock import AsyncMock, patch

import pytest

from mythos_sdk.jwks_cache import clear_cache, get_jwks


@pytest.fixture(autouse=True)
def reset_cache():
    clear_cache()
    yield
    clear_cache()


async def test_get_jwks_caches_separately_per_api_url():
    with patch("mythos_sdk.jwks_cache.get_http_client") as mock_client:
        mock_get = AsyncMock(side_effect=[
            _response({"keys": [{"kty": "RSA", "kid": "a"}]}),
            _response({"keys": [{"kty": "RSA", "kid": "b"}]}),
        ])
        mock_client.return_value.get = mock_get

        first = await get_jwks("https://api-a.example")
        second = await get_jwks("https://api-b.example")

    assert first != second
    assert mock_get.await_count == 2


def _response(payload: dict):
    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return payload

    return FakeResponse()
