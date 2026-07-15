from fastapi import HTTPException, Query
from jose.exceptions import JOSEError

from .api_client import consume_session
from .errors import InvalidLaunchTokenError, MythosConfigError
from .types import MythosSession
from .verify import verify_launch_token


async def require_launch_token(lt: str | None = Query(None, alias="lt")) -> MythosSession:
    if not lt:
        raise HTTPException(status_code=401, detail="Missing launch token")

    try:
        session = await verify_launch_token(lt)
    except MythosConfigError as err:
        raise HTTPException(status_code=500, detail=str(err)) from err
    except (InvalidLaunchTokenError, JOSEError):
        raise HTTPException(status_code=401, detail="Invalid launch token")
    except Exception:
        raise HTTPException(status_code=503, detail="Could not verify session")

    try:
        resp = await consume_session(session.sessionJti)
    except Exception:
        raise HTTPException(status_code=503, detail="Could not verify session")

    if resp.status_code == 409:
        raise HTTPException(status_code=401, detail="Token already consumed")
    if not (200 <= resp.status_code < 300):
        raise HTTPException(status_code=503, detail="Could not verify session")

    return session
