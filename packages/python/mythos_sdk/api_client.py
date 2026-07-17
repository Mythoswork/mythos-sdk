import uuid
from typing import Any
from urllib.parse import quote

from .config import load_config
from .errors import InsufficientFundsError, InvalidUsageError, SessionNotFoundError
from .http import get_http_client


def _encode_jti(jti: str) -> str:
    return quote(jti, safe="")


def _validate_credits(credits: int) -> None:
    if not isinstance(credits, int) or isinstance(credits, bool) or credits <= 0:
        raise InvalidUsageError("credits must be a positive integer")


async def consume_session(jti: str) -> Any:
    config = load_config()
    client = get_http_client()
    return await client.post(
        f"{config.api_url}/api/apps/sessions/{_encode_jti(jti)}/consume",
        json={},
    )


async def meter_session(
    jti: str,
    credits: int,
    reason: str | None = None,
    charge_id: str | None = None,
) -> None:
    _validate_credits(credits)
    config = load_config()
    body: dict[str, Any] = {"credits": credits, "charge_id": charge_id or str(uuid.uuid4())}
    if reason is not None:
        body["reason"] = reason

    client = get_http_client()
    resp = await client.post(
        f"{config.api_url}/api/apps/sessions/{_encode_jti(jti)}/meter",
        json=body,
    )

    if resp.status_code == 402:
        raise InsufficientFundsError()
    if resp.status_code == 404:
        raise SessionNotFoundError(jti)
    resp.raise_for_status()
