from .api_client import meter_session


async def report_usage(
    jti: str,
    credits: int,
    reason: str | None = None,
    *,
    idempotency_key: str | None = None,
) -> None:
    await meter_session(jti, credits, reason, charge_id=idempotency_key)
