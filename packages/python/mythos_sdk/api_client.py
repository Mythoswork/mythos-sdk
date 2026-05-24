import httpx

from .config import load_config
from .errors import InsufficientFundsError, SessionNotFoundError


async def consume_session(jti: str) -> httpx.Response:
    config = load_config()
    async with httpx.AsyncClient() as client:
        return await client.post(
            f"{config.api_url}/api/apps/sessions/{jti}/consume",
            json={},
        )


async def meter_session(jti: str, credits: int, reason: str | None = None) -> None:
    config = load_config()
    body: dict = {"credits": credits}
    if reason is not None:
        body["reason"] = reason

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{config.api_url}/api/apps/sessions/{jti}/meter",
            json=body,
        )

    if resp.status_code == 402:
        raise InsufficientFundsError()
    if resp.status_code == 404:
        raise SessionNotFoundError(jti)
    resp.raise_for_status()
