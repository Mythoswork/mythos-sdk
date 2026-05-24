from fastapi import HTTPException, Query

from .api_client import consume_session
from .types import MythosSession
from .verify import verify_launch_token


async def require_launch_token(lt: str = Query(..., alias="lt")) -> MythosSession:
    try:
        session = await verify_launch_token(lt)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid launch token")

    resp = await consume_session(session.sessionJti)
    if resp.status_code == 409:
        raise HTTPException(status_code=401, detail="Token already consumed")

    return session
