import time
import pytest
from jose import jwt
from unittest.mock import AsyncMock, patch

from mythos_sdk import verify_launch_token
from mythos_sdk import MythosSession


def mint_token(private_pem: bytes, overrides: dict | None = None) -> str:
    payload = {
        "sub": "user-123",
        "email": "consumer@example.com",
        "displayName": "Test User",
        "listingId": "listing-abc",
        "aud": "listing-abc",
        "iss": "https://api.mythos.work",
        "jti": "jti-001",
        "exp": int(time.time()) + 300,
        "iat": int(time.time()),
    }
    if overrides:
        payload.update(overrides)
    return jwt.encode(payload, private_pem, algorithm="RS256")


@pytest.fixture
def mock_jwks(rsa_key_pair):
    public_pem = rsa_key_pair["public"].decode()
    jwks = {"keys": [{"kty": "RSA", "use": "sig", "alg": "RS256", "kid": "test-kid", "pem": public_pem}]}

    with patch("mythos_sdk.verify.get_jwks", new_callable=AsyncMock, return_value=jwks), \
         patch("mythos_sdk.verify.get_jwks_with_kid_fallback", new_callable=AsyncMock, return_value=jwks):
        yield jwks


async def test_valid_token_accepted(rsa_key_pair, mock_jwks):
    token = mint_token(rsa_key_pair["private"])

    with patch("jose.jwt.decode") as mock_decode:
        mock_decode.return_value = {
            "sub": "user-123",
            "email": "consumer@example.com",
            "displayName": "Test User",
            "listingId": "listing-abc",
            "jti": "jti-001",
        }
        session = await verify_launch_token(token)

    assert isinstance(session, MythosSession)
    assert session.userId == "user-123"
    assert session.email == "consumer@example.com"
    assert session.sessionJti == "jti-001"


async def test_expired_token_rejected(rsa_key_pair, mock_jwks):
    from jose import JWTError

    with patch("jose.jwt.decode", side_effect=JWTError("expired")):
        # kid fallback also fails
        with patch("mythos_sdk.verify.get_jwks_with_kid_fallback", new_callable=AsyncMock, return_value=mock_jwks):
            with patch("jose.jwt.decode", side_effect=JWTError("expired")):
                with pytest.raises(JWTError):
                    await verify_launch_token("expired.token.here")


async def test_wrong_aud_rejected(rsa_key_pair, mock_jwks):
    from jose import JWTError

    with patch("jose.jwt.decode", side_effect=JWTError("audience mismatch")):
        with pytest.raises(JWTError):
            await verify_launch_token("wrong.aud.token")


async def test_alg_none_rejected(rsa_key_pair, mock_jwks):
    from jose import JWTError

    # Manually craft alg:none token
    import base64, json
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    body = base64.urlsafe_b64encode(json.dumps({"sub": "u", "aud": "listing-abc"}).encode()).rstrip(b"=").decode()
    none_token = f"{header}.{body}."

    # python-jose with algorithms=["RS256"] rejects alg:none
    with patch("jose.jwt.decode", side_effect=JWTError("Algorithm not allowed")):
        with pytest.raises(JWTError):
            await verify_launch_token(none_token)
