from typing import Any

from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError, JWTClaimsError

from .config import load_config
from .jwks_cache import get_jwks, get_jwks_with_kid_fallback
from .types import MythosSession

ALGORITHMS = ["RS256"]
_DECODE_OPTIONS = {"verify_aud": False}


def _build_session(payload: dict[str, Any]) -> MythosSession:
    return MythosSession(
        userId=payload["sub"],
        email=payload["email"],
        displayName=payload["displayName"],
        listingId=payload["listingId"],
        sessionJti=payload["jti"],
    )


def _validate_audience(payload: dict[str, Any], listing_ids: list[str]) -> None:
    """Check all aud elements for membership — avoids aud[0]-only ordering bug."""
    aud = payload.get("aud")
    if aud is None:
        raise JWTClaimsError("Missing audience claim")
    aud_values = aud if isinstance(aud, list) else [aud]
    if not any(a in listing_ids for a in aud_values):
        raise JWTClaimsError("Invalid audience")


async def verify_launch_token(token: str) -> MythosSession:
    config = load_config()

    jwks = await get_jwks(config.api_url)
    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=ALGORITHMS,
            issuer=config.api_url,
            options=_DECODE_OPTIONS,
        )
    except JWTError as e:
        if isinstance(e, (ExpiredSignatureError, JWTClaimsError)):
            raise
        # python-jose 3.x raises a bare JWTError with this message for signature
        # failures (version pinned <4 in pyproject.toml so this text stays stable).
        # A bad signature is not a kid miss — fail immediately, don't re-fetch JWKS.
        if "Signature verification failed" in str(e):
            raise
        # possible kid miss — re-fetch once
        jwks = await get_jwks_with_kid_fallback(config.api_url)
        payload = jwt.decode(
            token,
            jwks,
            algorithms=ALGORITHMS,
            issuer=config.api_url,
            options=_DECODE_OPTIONS,
        )

    _validate_audience(payload, config.listing_ids)
    return _build_session(payload)
