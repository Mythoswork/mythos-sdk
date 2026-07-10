import logging
import os
from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JOSEError, JWTClaimsError, JWTError

from .jwks_cache import get_jwks, get_jwks_with_kid_fallback

_logger = logging.getLogger(__name__)

_DEFAULT_API_URL = "https://api.mythos.work"
_MYTHOS_ISSUER = "mythos"
_DECODE_OPTIONS = {"verify_aud": False}


async def _validate_listing_callback_token(token: str) -> str:
    api_url = os.environ.get("MYTHOS_API_URL", _DEFAULT_API_URL)
    jwks = await get_jwks(api_url)
    try:
        payload = jwt.decode(
            token, jwks, algorithms=["RS256"], issuer=_MYTHOS_ISSUER, options=_DECODE_OPTIONS
        )
    except ExpiredSignatureError:
        raise
    except JWTError:
        jwks = await get_jwks_with_kid_fallback(api_url)
        payload = jwt.decode(
            token, jwks, algorithms=["RS256"], issuer=_MYTHOS_ISSUER, options=_DECODE_OPTIONS
        )

    if payload.get("purpose") != "listing_registered":
        raise JWTClaimsError("Token purpose is not listing_registered")

    return payload["listingId"]


def create_listing_callback_handler(
    on_registered: Callable[[str], Awaitable[None]],
) -> Callable[[Request], Awaitable[JSONResponse]]:
    async def mythos_listing_registered(request: Request) -> JSONResponse:
        token = request.query_params.get("lt")
        if not token:
            return JSONResponse({"error": "Missing listing callback token"}, status_code=401)
        try:
            listing_id = await _validate_listing_callback_token(token)
            await on_registered(listing_id)
        except JOSEError:
            return JSONResponse({"error": "Invalid listing callback token"}, status_code=401)
        except Exception:
            _logger.exception("listing-callback: unexpected error")
            return JSONResponse({"error": "Service unavailable"}, status_code=503)
        return JSONResponse({"ok": True})

    return mythos_listing_registered
