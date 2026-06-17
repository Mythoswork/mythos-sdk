import os

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from jose import JWTError
from jose import jwt

from .config import DEFAULT_API_URL
from .jwks_cache import get_jwks, get_jwks_with_kid_fallback

try:
    from importlib.metadata import version
    SDK_VERSION = version("mythos-sdk")
except Exception:
    SDK_VERSION = "0.1.0"

_ALGORITHMS = ["RS256"]
_DECODE_OPTS = {"verify_aud": False}


async def _verify_handshake_token(token: str) -> None:
    api_url = os.environ.get("MYTHOS_API_URL", DEFAULT_API_URL)
    try:
        jwks = await get_jwks(api_url)
        payload = jwt.decode(token, jwks, algorithms=_ALGORITHMS, options=_DECODE_OPTS)
    except JWTError:
        jwks = await get_jwks_with_kid_fallback(api_url)
        payload = jwt.decode(token, jwks, algorithms=_ALGORITHMS, options=_DECODE_OPTS)
    if payload.get("purpose") != "handshake-check":
        raise JWTError("invalid purpose")


def create_handshake_router() -> APIRouter:
    router = APIRouter()

    @router.get("/.well-known/mythos-handshake")
    async def mythos_handshake(lt: str = Query(...)) -> JSONResponse:
        try:
            await _verify_handshake_token(lt)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid handshake token")
        return JSONResponse({"ok": True, "sdk_version": SDK_VERSION})

    return router


handshake_router = create_handshake_router()
