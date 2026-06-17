from fastapi import APIRouter
from fastapi.responses import JSONResponse

SDK_VERSION = "0.1.0"

handshake_router = APIRouter()


@handshake_router.get("/.well-known/mythos-handshake")
async def mythos_handshake() -> JSONResponse:
    return JSONResponse({"ok": True, "sdk_version": SDK_VERSION})
