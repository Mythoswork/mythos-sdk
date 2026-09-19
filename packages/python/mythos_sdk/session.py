import base64
import hashlib
import json
import os
from dataclasses import asdict
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .errors import MythosConfigError
from .types import MythosSession

NONCE_LENGTH = 12


def _get_session_key() -> bytes:
    secret = os.environ.get("MYTHOS_SESSION_SECRET")
    if not secret:
        raise MythosConfigError("MYTHOS_SESSION_SECRET env var is required to encode/decode a Mythos session")
    return hashlib.sha256(secret.encode("utf-8")).digest()


def encode_session(session: MythosSession) -> str:
    """Encrypts a MythosSession (including its LLM identity token) into a compact,
    tamper-proof string sized to fit an HttpOnly cookie. This is what lets a Producer app
    support any number of its own routes off a single launch/consume, instead of
    re-verifying the launch token -- which is single-use -- on every page. The Producer
    sets the returned string as its own cookie (recommended: HttpOnly; Secure;
    SameSite=Lax); decode_session() reads it back on any later request with no call to
    Mythos at all.
    """
    key = _get_session_key()
    nonce = os.urandom(NONCE_LENGTH)
    plaintext = json.dumps(asdict(session)).encode("utf-8")
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii").rstrip("=")


def decode_session(token: str) -> MythosSession | None:
    """Decrypts a value produced by encode_session(). Returns None for anything that isn't
    a currently-valid session -- tampered, malformed, or past its own
    llmIdentityExpiresAt -- rather than raising, since "no valid session" is an expected,
    ordinary outcome for a caller (e.g. redirect back through launch again), not an error
    condition. A missing MYTHOS_SESSION_SECRET is a real misconfiguration and still raises
    MythosConfigError.
    """
    key = _get_session_key()
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii"))
        nonce, ciphertext = raw[:NONCE_LENGTH], raw[NONCE_LENGTH:]
        plaintext = AESGCM(key).decrypt(nonce, ciphertext, None)
        data = json.loads(plaintext.decode("utf-8"))

        expires_at = data.get("llmIdentityExpiresAt")
        if expires_at and datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc):
            return None
        return MythosSession(**data)
    except Exception:
        return None
