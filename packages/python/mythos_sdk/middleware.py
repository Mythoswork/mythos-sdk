from collections.abc import Awaitable, Callable
from dataclasses import replace

from fastapi import HTTPException, Query
import httpx
from jose.exceptions import JOSEError

from .api_client import consume_session, read_identity_fields
from .errors import InvalidLaunchTokenError, MythosConfigError
from .logger import log_error
from .types import MythosSession
from .verify import verify_launch_token


def _attach_identity_token(session: MythosSession, response: httpx.Response) -> MythosSession:
    try:
        identity = read_identity_fields(response.json())
    except (AttributeError, TypeError, ValueError):
        return session
    if identity is None:
        return session
    token, expires_at = identity
    return replace(
        session,
        llmIdentityToken=token,
        llmIdentityExpiresAt=expires_at if isinstance(expires_at, str) else None,
    )


def require_launch_token(
    resolve_listing_ids: Callable[[], Awaitable[list[str]]] | None = None,
) -> Callable[..., Awaitable[MythosSession]]:
    async def dependency(lt: str = Query(..., alias="lt")) -> MythosSession:
        if not lt:
            raise HTTPException(status_code=401, detail="Missing launch token")

        try:
            session = await verify_launch_token(lt, resolve_listing_ids)
        except MythosConfigError as err:
            log_error("require_launch_token: invalid configuration", err)
            raise HTTPException(status_code=500, detail=str(err)) from err
        except (InvalidLaunchTokenError, JOSEError):
            raise HTTPException(status_code=401, detail="Invalid launch token")
        except Exception as err:
            log_error("require_launch_token: launch token verification failed", err)
            raise HTTPException(status_code=503, detail="Could not verify session")

        try:
            resp = await consume_session(session.sessionJti)
        except Exception as err:
            # Network error / unreachable consume endpoint — fail closed, never grant
            # single-use access without a confirmed consume.
            log_error("require_launch_token: consume request failed", err)
            raise HTTPException(status_code=503, detail="Could not verify session")

        if resp.status_code == 409:
            raise HTTPException(status_code=401, detail="Token already consumed")
        if not (200 <= resp.status_code < 300):
            # Any other non-2xx (500, 503, ...) is unconfirmed — fail closed.
            log_error(f"require_launch_token: consume returned {resp.status_code}")
            raise HTTPException(status_code=503, detail="Could not verify session")

        return _attach_identity_token(session, resp)

    return dependency
