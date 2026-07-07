import time
import pytest
from jose import jwt, JWTError
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI

from mythos_sdk import create_handshake_router
from mythos_sdk.version import SDK_VERSION


def mint_handshake_token(private_pem: bytes, overrides: dict | None = None) -> str:
    payload = {
        "sub": "listing-abc",
        "purpose": "handshake-check",
        "exp": int(time.time()) + 120,
        "iat": int(time.time()),
    }
    if overrides:
        payload.update(overrides)
    return jwt.encode(payload, private_pem, algorithm="RS256")


@pytest.fixture
def mock_jwks(rsa_key_pair):
    jwks = {"keys": [rsa_key_pair["jwk"]]}
    with patch("mythos_sdk.handshake.get_jwks", new_callable=AsyncMock, return_value=jwks), \
         patch("mythos_sdk.handshake.get_jwks_with_kid_fallback", new_callable=AsyncMock, return_value=jwks):
        yield jwks


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(create_handshake_router())
    return TestClient(app)


def test_valid_handshake_token_returns_200(client, rsa_key_pair, mock_jwks):
    token = mint_handshake_token(rsa_key_pair["private"])
    resp = client.get("/.well-known/mythos-handshake", params={"lt": token})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["sdk_version"] == SDK_VERSION


def test_missing_lt_returns_401(client, mock_jwks):
    resp = client.get("/.well-known/mythos-handshake")
    assert resp.status_code == 401
    assert resp.json()["error"] == "Missing launch token"


def test_expired_token_returns_401(client, rsa_key_pair, mock_jwks):
    token = mint_handshake_token(rsa_key_pair["private"], {"exp": int(time.time()) - 10})
    resp = client.get("/.well-known/mythos-handshake", params={"lt": token})
    assert resp.status_code == 401
    assert resp.json()["error"] == "Invalid launch token"


def test_wrong_purpose_returns_401(client, rsa_key_pair, mock_jwks):
    token = mint_handshake_token(rsa_key_pair["private"], {"purpose": "launch"})
    resp = client.get("/.well-known/mythos-handshake", params={"lt": token})
    assert resp.status_code == 401
    assert resp.json()["error"] == "Invalid launch token"


def test_no_purpose_claim_returns_401(client, rsa_key_pair, mock_jwks):
    payload = {
        "sub": "listing-abc",
        "exp": int(time.time()) + 120,
        "iat": int(time.time()),
    }
    token = jwt.encode(payload, rsa_key_pair["private"], algorithm="RS256")
    resp = client.get("/.well-known/mythos-handshake", params={"lt": token})
    assert resp.status_code == 401
    assert resp.json()["error"] == "Invalid launch token"


def test_kid_fallback_succeeds_with_fresh_jwks(client, rsa_key_pair):
    # python-jose never raises JWKError for key mismatches; it raises JWTError
    # ("Signature verification failed") when no key validates the signature.
    # The stale JWKS must have genuinely different key material — not just a
    # different kid — otherwise python-jose validates it without triggering fallback.
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

    with patch("mythos_sdk.handshake.get_jwks", new_callable=AsyncMock, return_value=stale_jwks), \
         patch("mythos_sdk.handshake.get_jwks_with_kid_fallback", new_callable=AsyncMock, return_value=valid_jwks):
        token = mint_handshake_token(rsa_key_pair["private"])
        resp = client.get("/.well-known/mythos-handshake", params={"lt": token})

    assert resp.status_code == 200
    assert resp.json()["ok"] is True


def test_jwks_fetch_failure_returns_503(client, rsa_key_pair):
    with patch("mythos_sdk.handshake.get_jwks", new_callable=AsyncMock, side_effect=Exception("Network error")):
        token = mint_handshake_token(rsa_key_pair["private"])
        resp = client.get("/.well-known/mythos-handshake", params={"lt": token})

    assert resp.status_code == 503
    assert resp.json()["error"] == "Service unavailable"
