from .api_client import meter_session


async def report_usage(
    jti: str,
    credits: int,
    reason: str | None = None,
    charge_id: str | None = None,
) -> None:
    await meter_session(jti, credits, reason, charge_id)
