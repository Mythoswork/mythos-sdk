from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Query
from jose.exceptions import JOSEError

from .api_client import consume_session
from .errors import InvalidLaunchTokenError, MythosConfigError
from .types import MythosSession
from .verify import verify_launch_token

def require_launch_token(
    resolve_listing_ids: Callable[[], Awaitable[list[str]]] | None = None,
) -> Callable[..., Awaitable[MythosSession]]:
    async def dependency(lt: str = Query(..., alias="lt")) -> MythosSession:
        if not lt:
            raise HTTPException(status_code=401, detail="Missing launch token")

        try:
            session = await verify_launch_token(lt, resolve_listing_ids)
        except MythosConfigError as err:
            raise HTTPException(status_code=500, detail=str(err)) from err
        except (InvalidLaunchTokenError, JOSEError):
            raise HTTPException(status_code=401, detail="Invalid launch token")
        except Exception:
            raise HTTPException(status_code=503, detail="Could not verify session")

        try:
            resp = await consume_session(session.sessionJti)
        except Exception:
            # Network error / unreachable consume endpoint — fail closed, never grant
            # single-use access without a confirmed consume.
            raise HTTPException(status_code=503, detail="Could not verify session")

        if resp.status_code == 409:
            raise HTTPException(status_code=401, detail="Token already consumed")
        if not (200 <= resp.status_code < 300):
            # Any other non-2xx (500, 503, ...) is unconfirmed — fail closed.
            raise HTTPException(status_code=503, detail="Could not verify session")

        return session

    return dependency
