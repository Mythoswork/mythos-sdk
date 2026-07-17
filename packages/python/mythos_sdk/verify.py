from collections.abc import Awaitable, Callable
from typing import Any

from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError, JWTClaimsError

from .config import load_config
from .errors import InvalidLaunchTokenError
from .jwks_cache import get_jwks, get_jwks_with_kid_fallback
from .types import MythosSession

ALGORITHMS = ["RS256"]
_DECODE_OPTIONS = {"verify_aud": False}

# Matches backend's HANDSHAKE_ISS_CLAIM constant — the platform issuer is a
# fixed identifier, not the API URL (which varies by environment).
MYTHOS_ISSUER = "mythos"


def _require_string_claim(payload: dict[str, Any], claim: str) -> str:
    value = payload.get(claim)
    if not isinstance(value, str) or not value:
        raise InvalidLaunchTokenError(f"Missing {claim} claim")
    return value


def _validate_audience(payload: dict[str, Any], listing_ids: list[str]) -> None:
    aud = payload.get("aud")
    if aud is None:
        raise InvalidLaunchTokenError("Missing audience claim")
    aud_values = aud if isinstance(aud, list) else [aud]
    if not any(a in listing_ids for a in aud_values):
        raise InvalidLaunchTokenError("Invalid audience")


def _build_session(payload: dict[str, Any], listing_ids: list[str]) -> MythosSession:
    _validate_audience(payload, listing_ids)

    listing_id = _require_string_claim(payload, "listingId")
    if listing_id not in listing_ids:
        raise InvalidLaunchTokenError("listingId does not match configured listing ID")

    return MythosSession(
        userId=_require_string_claim(payload, "sub"),
        email=_require_string_claim(payload, "email"),
        displayName=_require_string_claim(payload, "displayName"),
        listingId=listing_id,
        sessionJti=_require_string_claim(payload, "jti"),
    )


async def verify_launch_token(
    token: str,
    resolve_listing_ids: Callable[[], Awaitable[list[str]]] | None = None,
) -> MythosSession:
    """Verify a launch token signature and claims only.

    WARNING: This does NOT call /consume and does NOT enforce single-use semantics.
    Use require_launch_token() for route protection (ADR-0003).
    """
    config = load_config()

    jwks = await get_jwks(config.api_url)
    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=ALGORITHMS,
            issuer=MYTHOS_ISSUER,
            options=_DECODE_OPTIONS,
        )
    except JWTError as e:
        if isinstance(e, (ExpiredSignatureError, JWTClaimsError, InvalidLaunchTokenError)):
            raise
        if "Signature verification failed" in str(e):
            raise
        jwks = await get_jwks_with_kid_fallback(config.api_url)
        payload = jwt.decode(
            token,
            jwks,
            algorithms=ALGORITHMS,
            issuer=MYTHOS_ISSUER,
            options=_DECODE_OPTIONS,
        )

    dynamic_ids = await resolve_listing_ids() if resolve_listing_ids else []
    if not config.listing_ids and not dynamic_ids:
        raise RuntimeError(
            "MYTHOS_LISTING_ID or MYTHOS_LISTING_IDS env var is required, or pass resolve_listing_ids"
        )
    all_listing_ids = config.listing_ids + dynamic_ids
    _validate_audience(payload, all_listing_ids)
    return _build_session(payload, all_listing_ids)
