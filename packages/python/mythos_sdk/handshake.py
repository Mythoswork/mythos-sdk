import logging
import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JOSEError, JWTError

from .jwks_cache import get_jwks, get_jwks_with_kid_fallback
from .version import SDK_VERSION

_logger = logging.getLogger(__name__)

_DEFAULT_API_URL = "https://api.mythos.work"
# Handshake tokens are validated by signature and purpose only.
_DECODE_OPTIONS = {"verify_aud": False, "verify_iss": False}


async def _validate_handshake_token(token: str) -> None:
    api_url = os.environ.get("MYTHOS_API_URL", _DEFAULT_API_URL)
    jwks = await get_jwks(api_url)
    try:
        payload = jwt.decode(token, jwks, algorithms=["RS256"], options=_DECODE_OPTIONS)
    except ExpiredSignatureError:
        raise
    except JWTError:
        jwks = await get_jwks_with_kid_fallback(api_url)
        payload = jwt.decode(token, jwks, algorithms=["RS256"], options=_DECODE_OPTIONS)

    if payload.get("purpose") != "handshake-check":
        raise JWTError("Token purpose is not handshake-check")


def create_handshake_router() -> APIRouter:
    router = APIRouter()

    @router.get("/.well-known/mythos-handshake")
    async def mythos_handshake(request: Request) -> JSONResponse:
        token = request.query_params.get("lt")
        if not token:
            return JSONResponse({"error": "Missing launch token"}, status_code=401)
        try:
            await _validate_handshake_token(token)
        except JOSEError:
            return JSONResponse({"error": "Invalid launch token"}, status_code=401)
        except Exception:
            _logger.exception("Unexpected error in handshake endpoint")
            return JSONResponse({"error": "Service unavailable"}, status_code=503)
        return JSONResponse({"ok": True, "sdk_version": SDK_VERSION})

    return router


handshake_router = create_handshake_router()
