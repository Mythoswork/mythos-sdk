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

    NOT cross-language compatible with the Node SDK's encodeSession/decodeSession, even
    with the same MYTHOS_SESSION_SECRET: AESGCM.encrypt() here produces
    ciphertext || tag(16), appended after the nonce, while Node writes
    iv(12) || authTag(16) || ciphertext -- a different byte layout under the same field
    names. A Producer app must encode and decode its session cookie with the same
    language's SDK throughout -- there is no supported mixed-language deployment for a
    single cookie.
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


def seal_session(session: MythosSession, expires_at: str) -> str:
    key = _get_session_key()
    nonce = os.urandom(NONCE_LENGTH)
    payload = asdict(session) | {"expiresAt": expires_at}
    plaintext = json.dumps(payload).encode("utf-8")
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii").rstrip("=")


def open_session(token: str) -> tuple[MythosSession, str] | None:
    key = _get_session_key()
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii"))
        nonce, ciphertext = raw[:NONCE_LENGTH], raw[NONCE_LENGTH:]
        plaintext = AESGCM(key).decrypt(nonce, ciphertext, None)
        payload = json.loads(plaintext.decode("utf-8"))
        if not isinstance(payload, dict):
            return None
        expires_at = payload.pop("expiresAt", None)
        if not isinstance(expires_at, str):
            return None
        parsed_expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if parsed_expiry.tzinfo is None:
            parsed_expiry = parsed_expiry.replace(tzinfo=timezone.utc)
        if parsed_expiry <= datetime.now(timezone.utc):
            return None
        return MythosSession(**payload), expires_at
    except Exception:
        return None
