from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import APIRouter, Request
    from fastapi.responses import JSONResponse

from .errors import (
    InsufficientFundsError,
    InvalidLaunchTokenError,
    InvalidUsageError,
    LaunchTokenConsumedError,
    MythosConfigError,
    MythosError,
    MythosUnreachableError,
    MythosUpstreamError,
    SessionExpiredError,
    SessionNotFoundError,
    SessionRequiredError,
)
from .api_client import MeterResult
from .mythos import Mythos, create_mythos
from .report_usage import report_usage
from .session import decode_session, encode_session
from .types import MythosSession
from .verify import verify_launch_token


def require_launch_token(
    resolve_listing_ids: Callable[[], Awaitable[list[str]]] | None = None,
) -> Callable[..., Awaitable[MythosSession]]:
    from .middleware import require_launch_token as build_dependency

    return build_dependency(resolve_listing_ids)


def create_handshake_router() -> APIRouter:
    from .handshake import create_handshake_router as build_router

    return build_router()


def create_listing_callback_handler(
    on_registered: Callable[[str], Awaitable[None]],
) -> Callable[[Request], Awaitable[JSONResponse]]:
    from .listing_callback import create_listing_callback_handler as build_handler

    return build_handler(on_registered)


def __getattr__(name: str) -> object:
    if name == "handshake_router":
        from .handshake import handshake_router

        return handshake_router
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "verify_launch_token",
    "create_mythos",
    "Mythos",
    "MeterResult",
    "require_launch_token",
    "report_usage",
    "handshake_router",
    "create_handshake_router",
    "create_listing_callback_handler",
    "encode_session",
    "decode_session",
    "MythosSession",
    "MythosError",
    "MythosConfigError",
    "InvalidLaunchTokenError",
    "InsufficientFundsError",
    "SessionNotFoundError",
    "InvalidUsageError",
    "SessionRequiredError",
    "SessionExpiredError",
    "LaunchTokenConsumedError",
    "MythosUpstreamError",
    "MythosUnreachableError",
]
