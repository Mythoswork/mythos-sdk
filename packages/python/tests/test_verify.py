import time
import base64
import json
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa as _rsa
from cryptography.hazmat.primitives import serialization
from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError, JWTClaimsError
from unittest.mock import AsyncMock, patch

from mythos_sdk import verify_launch_token
from mythos_sdk import MythosSession
from mythos_sdk.errors import InvalidLaunchTokenError


def mint_token(private_pem: bytes, overrides: dict | None = None) -> str:
    payload = {
        "sub": "user-123",
        "email": "consumer@example.com",
        "displayName": "Test User",
        "listingId": "listing-abc",
        "aud": "listing-abc",
        "iss": "mythos",
        "jti": "jti-001",
        "exp": int(time.time()) + 300,
        "iat": int(time.time()),
    }
    if overrides:
        payload.update(overrides)
    return jwt.encode(payload, private_pem, algorithm="RS256")


@pytest.fixture
def mock_jwks(rsa_key_pair):
    jwks = {"keys": [rsa_key_pair["jwk"]]}
    with patch("mythos_sdk.verify.get_jwks", new_callable=AsyncMock, return_value=jwks), \
         patch("mythos_sdk.verify.get_jwks_with_kid_fallback", new_callable=AsyncMock, return_value=jwks):
        yield jwks


async def test_valid_token_accepted(rsa_key_pair, mock_jwks):
    token = mint_token(rsa_key_pair["private"])
    session = await verify_launch_token(token)
    assert isinstance(session, MythosSession)
    assert session.userId == "user-123"
    assert session.email == "consumer@example.com"
    assert session.sessionJti == "jti-001"


async def test_wrong_iss_rejected(rsa_key_pair, mock_jwks):
    token = mint_token(rsa_key_pair["private"], {"iss": "https://evil.example.com"})
    with pytest.raises(JWTClaimsError):
        await verify_launch_token(token)


async def test_wrong_iss_does_not_refetch(rsa_key_pair):
    jwks = {"keys": [rsa_key_pair["jwk"]]}
    mock_refetch = AsyncMock(return_value=jwks)
    token = mint_token(rsa_key_pair["private"], {"iss": "https://evil.example.com"})
    with patch("mythos_sdk.verify.get_jwks", new_callable=AsyncMock, return_value=jwks), \
         patch("mythos_sdk.verify.get_jwks_with_kid_fallback", mock_refetch):
        with pytest.raises(JWTClaimsError):
            await verify_launch_token(token)
    mock_refetch.assert_not_called()


async def test_expired_token_rejected(rsa_key_pair, mock_jwks):
    token = mint_token(rsa_key_pair["private"], {"exp": int(time.time()) - 10})
    with pytest.raises(ExpiredSignatureError):
        await verify_launch_token(token)


async def test_expired_token_does_not_refetch(rsa_key_pair):
    jwks = {"keys": [rsa_key_pair["jwk"]]}
    mock_refetch = AsyncMock(return_value=jwks)
    token = mint_token(rsa_key_pair["private"], {"exp": int(time.time()) - 10})
    with patch("mythos_sdk.verify.get_jwks", new_callable=AsyncMock, return_value=jwks), \
         patch("mythos_sdk.verify.get_jwks_with_kid_fallback", mock_refetch):
        with pytest.raises(ExpiredSignatureError):
            await verify_launch_token(token)
    mock_refetch.assert_not_called()


async def test_wrong_aud_rejected(rsa_key_pair, mock_jwks):
    token = mint_token(rsa_key_pair["private"], {"aud": "evil-other-service"})
    with pytest.raises(InvalidLaunchTokenError):
        await verify_launch_token(token)


async def test_aud_list_valid_member_accepted(rsa_key_pair, mock_jwks):
    token = mint_token(rsa_key_pair["private"], {"aud": ["evil-other-service", "listing-abc"]})
    session = await verify_launch_token(token)
    assert session.listingId == "listing-abc"


async def test_aud_list_no_match_rejected(rsa_key_pair, mock_jwks):
    token = mint_token(rsa_key_pair["private"], {"aud": ["evil-a", "evil-b"]})
    with pytest.raises(InvalidLaunchTokenError):
        await verify_launch_token(token)


async def test_missing_jti_rejected(rsa_key_pair, mock_jwks):
    token = mint_token(rsa_key_pair["private"], {"jti": ""})
    with pytest.raises(InvalidLaunchTokenError):
        await verify_launch_token(token)


async def test_alg_none_rejected(rsa_key_pair, mock_jwks):
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    body = base64.urlsafe_b64encode(json.dumps({"sub": "u", "aud": "listing-abc"}).encode()).rstrip(b"=").decode()
    none_token = f"{header}.{body}."
    with pytest.raises(JWTError):
        await verify_launch_token(none_token)


async def test_bad_signature_does_not_refetch(rsa_key_pair):
    other_key = _rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    token = mint_token(other_pem)
    jwks = {"keys": [rsa_key_pair["jwk"]]}
    mock_refetch = AsyncMock(return_value=jwks)
    with patch("mythos_sdk.verify.get_jwks", new_callable=AsyncMock, return_value=jwks), \
         patch("mythos_sdk.verify.get_jwks_with_kid_fallback", mock_refetch):
        with pytest.raises(JWTError):
            await verify_launch_token(token)
    mock_refetch.assert_not_called()
