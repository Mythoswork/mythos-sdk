import time
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from mythos_sdk import create_listing_callback_router


def mint_callback_token(private_pem: bytes, overrides: dict | None = None) -> str:
    payload = {
        "purpose": "listing_registered",
        "listingId": "listing-xyz",
        "iss": "mythos",
        "exp": int(time.time()) + 120,
        "iat": int(time.time()),
    }
    if overrides:
        payload.update(overrides)
    return jwt.encode(payload, private_pem, algorithm="RS256")


@pytest.fixture
def mock_jwks(rsa_key_pair):
    jwks = {"keys": [rsa_key_pair["jwk"]]}
    with patch("mythos_sdk.listing_callback.get_jwks", new_callable=AsyncMock, return_value=jwks), \
         patch("mythos_sdk.listing_callback.get_jwks_with_kid_fallback", new_callable=AsyncMock, return_value=jwks):
        yield jwks


def make_client(on_registered):
    app = FastAPI()
    app.include_router(create_listing_callback_router(on_registered))
    return TestClient(app)


def test_valid_callback_token_calls_on_registered_returns_200(rsa_key_pair, mock_jwks):
    on_registered = AsyncMock()
    client = make_client(on_registered)
    token = mint_callback_token(rsa_key_pair["private"])

    resp = client.get("/.well-known/mythos-listing-registered", params={"lt": token})

    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    on_registered.assert_awaited_once_with("listing-xyz")


def test_post_method_calls_on_registered_returns_200(rsa_key_pair, mock_jwks):
    # Regression: the backend calls this callback via POST (query-string lt,
    # no body), not GET. FastAPI routes are method-restricted by default,
    # unlike Express's bare RequestHandler — this must accept both.
    on_registered = AsyncMock()
    client = make_client(on_registered)
    token = mint_callback_token(rsa_key_pair["private"])

    resp = client.post("/.well-known/mythos-listing-registered", params={"lt": token})

    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    on_registered.assert_awaited_once_with("listing-xyz")


def test_missing_lt_returns_401(mock_jwks):
    on_registered = AsyncMock()
    client = make_client(on_registered)

    resp = client.get("/.well-known/mythos-listing-registered")

    assert resp.status_code == 401
    assert resp.json()["error"] == "Missing listing callback token"
    on_registered.assert_not_called()


def test_expired_token_returns_401(rsa_key_pair, mock_jwks):
    on_registered = AsyncMock()
    client = make_client(on_registered)
    token = mint_callback_token(rsa_key_pair["private"], {"exp": int(time.time()) - 10})

    resp = client.get("/.well-known/mythos-listing-registered", params={"lt": token})

    assert resp.status_code == 401
    assert resp.json()["error"] == "Invalid listing callback token"
    on_registered.assert_not_called()


def test_wrong_purpose_returns_401(rsa_key_pair, mock_jwks):
    on_registered = AsyncMock()
    client = make_client(on_registered)
    token = mint_callback_token(rsa_key_pair["private"], {"purpose": "handshake-check"})

    resp = client.get("/.well-known/mythos-listing-registered", params={"lt": token})

    assert resp.status_code == 401
    assert resp.json()["error"] == "Invalid listing callback token"
    on_registered.assert_not_called()


def test_no_purpose_claim_returns_401(rsa_key_pair, mock_jwks):
    on_registered = AsyncMock()
    client = make_client(on_registered)
    payload = {
        "listingId": "listing-xyz",
        "iss": "mythos",
        "exp": int(time.time()) + 120,
        "iat": int(time.time()),
    }
    token = jwt.encode(payload, rsa_key_pair["private"], algorithm="RS256")

    resp = client.get("/.well-known/mythos-listing-registered", params={"lt": token})

    assert resp.status_code == 401
    assert resp.json()["error"] == "Invalid listing callback token"
    on_registered.assert_not_called()


def test_kid_fallback_succeeds_with_fresh_jwks(rsa_key_pair):
    import base64
    from cryptography.hazmat.primitives.asymmetric import rsa as _rsa

    stale_priv = _rsa.generate_private_key(public_exponent=65537, key_size=2048)
    stale_nums = stale_priv.public_key().public_numbers()

    def _b64(n: int) -> str:
        length = (n.bit_length() + 7) // 8
        return base64.urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode()

    stale_jwks = {"keys": [{"kty": "RSA", "alg": "RS256", "kid": "stale-kid",
                             "n": _b64(stale_nums.n), "e": _b64(stale_nums.e)}]}
    valid_jwks = {"keys": [rsa_key_pair["jwk"]]}

    on_registered = AsyncMock()
    client = make_client(on_registered)
    token = mint_callback_token(rsa_key_pair["private"])

    with patch("mythos_sdk.listing_callback.get_jwks", new_callable=AsyncMock, return_value=stale_jwks), \
         patch("mythos_sdk.listing_callback.get_jwks_with_kid_fallback", new_callable=AsyncMock, return_value=valid_jwks):
        resp = client.get("/.well-known/mythos-listing-registered", params={"lt": token})

    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    on_registered.assert_awaited_once_with("listing-xyz")


def test_on_registered_raises_returns_503(rsa_key_pair, mock_jwks):
    on_registered = AsyncMock(side_effect=Exception("DB write failed"))
    client = make_client(on_registered)
    token = mint_callback_token(rsa_key_pair["private"])

    resp = client.get("/.well-known/mythos-listing-registered", params={"lt": token})

    assert resp.status_code == 503
    assert resp.json()["error"] == "Service unavailable"


def test_jwks_fetch_failure_returns_503(rsa_key_pair):
    on_registered = AsyncMock()
    client = make_client(on_registered)
    token = mint_callback_token(rsa_key_pair["private"])

    with patch("mythos_sdk.listing_callback.get_jwks", new_callable=AsyncMock, side_effect=Exception("Network error")):
        resp = client.get("/.well-known/mythos-listing-registered", params={"lt": token})

    assert resp.status_code == 503
    assert resp.json()["error"] == "Service unavailable"
