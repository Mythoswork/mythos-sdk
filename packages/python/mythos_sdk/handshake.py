import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JOSEError, JWTError

from .errors import ProducerMismatchError
from .jwks_cache import get_jwks, get_jwks_with_kid_fallback
from .logger import log_error, log_warn
from .producer_key import assert_producer_binding, read_producer_key, warn_missing_producer_key_once
from .version import SDK_VERSION

_DEFAULT_API_URL = "https://api.mythos.work"
# Handshake tokens are validated by signature, purpose, and Producer binding.
_DECODE_OPTIONS = {"verify_aud": False, "verify_iss": False}


async def _validate_handshake_token(token: str) -> None:
    api_url = os.environ.get("MYTHOS_API_URL", _DEFAULT_API_URL)
    jwks = await get_jwks(api_url)
    try:
        payload = jwt.decode(token, jwks, algorithms=["ES256"], options=_DECODE_OPTIONS)
    except ExpiredSignatureError:
        raise
    except JWTError:
        jwks = await get_jwks_with_kid_fallback(api_url)
        payload = jwt.decode(token, jwks, algorithms=["ES256"], options=_DECODE_OPTIONS)

    if payload.get("purpose") != "handshake-check":
        raise JWTError("Token purpose is not handshake-check")
    assert_producer_binding(payload)
    if not read_producer_key():
        warn_missing_producer_key_once()


def create_handshake_router() -> APIRouter:
    router = APIRouter()

    @router.get("/.well-known/mythos-handshake")
    async def mythos_handshake(request: Request) -> JSONResponse:
        token = request.query_params.get("lt")
        if not token:
            return JSONResponse({"error": "Missing launch token"}, status_code=401)
        try:
            await _validate_handshake_token(token)
        except ProducerMismatchError as err:
            log_warn("handshake: producer mismatch", {"listingId": err.listing_id})
            return JSONResponse({"error": "Producer mismatch"}, status_code=401)
        except JOSEError:
            return JSONResponse({"error": "Invalid launch token"}, status_code=401)
        except Exception as err:
            log_error("handshake: unexpected error", err)
            return JSONResponse({"error": "Service unavailable"}, status_code=503)
        return JSONResponse({"ok": True, "sdk_version": SDK_VERSION})

    return router


handshake_router = create_handshake_router()
