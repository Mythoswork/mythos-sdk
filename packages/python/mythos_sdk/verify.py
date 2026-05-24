from jose import jwt, JWTError

from .config import load_config
from .jwks_cache import get_jwks, get_jwks_with_kid_fallback
from .types import MythosSession

ALGORITHMS = ["RS256"]


def _build_session(payload: dict) -> MythosSession:
    return MythosSession(
        userId=payload["sub"],
        email=payload["email"],
        displayName=payload["displayName"],
        listingId=payload["listingId"],
        sessionJti=payload["jti"],
    )


async def verify_launch_token(token: str) -> MythosSession:
    config = load_config()

    jwks = await get_jwks(config.api_url)
    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=ALGORITHMS,
            audience=config.listing_ids,
        )
    except JWTError:
        # kid miss — re-fetch once
        jwks = await get_jwks_with_kid_fallback(config.api_url)
        payload = jwt.decode(
            token,
            jwks,
            algorithms=ALGORITHMS,
            audience=config.listing_ids,
        )

    return _build_session(payload)
