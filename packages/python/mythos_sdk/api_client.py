import uuid
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from .config import load_config
from .errors import (
    InsufficientFundsError,
    InvalidUsageError,
    MythosUnreachableError,
    MythosUpstreamError,
    SessionExpiredError,
    SessionNotFoundError,
)
from .http import get_http_client
@dataclass(frozen=True)
class MeterResult:
    charge_id: str
    session_metered_total: int | None


def read_identity_fields(body: object) -> tuple[str, str | None] | None:
    if not isinstance(body, dict):
        return None
    data = body.get("data")
    if not isinstance(data, dict):
        return None
    token = data.get("llm_identity_token")
    if not isinstance(token, str) or not token:
        return None
    expires_at = data.get("llm_identity_expires_at")
    return token, expires_at if isinstance(expires_at, str) else None


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
) -> MeterResult:
    _validate_credits(credits)
    config = load_config()
    resolved_charge_id = charge_id if charge_id is not None else str(uuid.uuid4())
    body: dict[str, Any] = {"credits": credits, "charge_id": resolved_charge_id}
    if reason is not None:
        body["reason"] = reason

    client = get_http_client()
    try:
        resp = await client.post(
            f"{config.api_url}/api/apps/sessions/{_encode_jti(jti)}/meter",
            json=body,
        )
    except httpx.HTTPError as err:
        raise MythosUnreachableError(f"Could not reach Mythos API: {err}") from err

    if resp.status_code == 402:
        raise InsufficientFundsError()
    code: str | None = None
    if not (200 <= resp.status_code < 300):
        try:
            response_body = resp.json()
            if isinstance(response_body, dict) and isinstance(response_body.get("code"), str):
                code = response_body["code"]
        except (ValueError, TypeError):
            pass
        if code in {"SESSION_EXPIRED", "SESSION_NOT_STARTED"}:
            raise SessionExpiredError()
        if resp.status_code == 404:
            raise SessionNotFoundError(jti)
        raise MythosUpstreamError("Meter request failed", resp.status_code, code)

    try:
        response_body = resp.json()
    except (ValueError, TypeError):
        response_body = None
    data = response_body.get("data") if isinstance(response_body, dict) else None
    total = data.get("session_metered_total") if isinstance(data, dict) else None
    session_total = total if isinstance(total, int) and not isinstance(total, bool) and total >= 0 else None
    return MeterResult(charge_id=resolved_charge_id, session_metered_total=session_total)
