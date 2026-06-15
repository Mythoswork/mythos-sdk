from fastapi import HTTPException, Query

from .api_client import consume_session
from .types import MythosSession
from .verify import verify_launch_token


async def require_launch_token(lt: str = Query(..., alias="lt")) -> MythosSession:
    try:
        session = await verify_launch_token(lt)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid launch token")

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
