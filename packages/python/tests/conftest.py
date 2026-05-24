import os
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization


@pytest.fixture(autouse=True)
def set_env(monkeypatch):
    monkeypatch.setenv("MYTHOS_LISTING_ID", "listing-abc")
    monkeypatch.setenv("MYTHOS_API_URL", "https://api.mythos.work")
    monkeypatch.delenv("MYTHOS_LISTING_IDS", raising=False)


@pytest.fixture(scope="session")
def rsa_key_pair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
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
    return {"private": private_pem, "public": public_pem, "private_key": private_key}
