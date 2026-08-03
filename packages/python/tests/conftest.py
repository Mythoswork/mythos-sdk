import base64
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization


def _int_to_base64url(n: int) -> str:
    length = (n.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode()


@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    monkeypatch.setenv("MYTHOS_LISTING_ID", "listing-abc")
    monkeypatch.setenv("MYTHOS_API_URL", "https://api.mythos.work")
    monkeypatch.delenv("MYTHOS_LISTING_IDS", raising=False)


@pytest.fixture(scope="session")
def rsa_key_pair():
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    pub_numbers = public_key.public_numbers()
    jwk = {
        "kty": "EC",
        "use": "sig",
        "alg": "ES256",
        "kid": "test-kid",
        "crv": "P-256",
        "x": _int_to_base64url(pub_numbers.x),
        "y": _int_to_base64url(pub_numbers.y),
    }
    return {"private": private_pem, "public": public_pem, "private_key": private_key, "jwk": jwk}
