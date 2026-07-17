import re
import pytest
from unittest.mock import AsyncMock, patch

from mythos_sdk import report_usage
from mythos_sdk import InsufficientFundsError, SessionNotFoundError


async def test_report_usage_calls_meter_with_correct_body():
    mock_meter = AsyncMock()
    with patch("mythos_sdk.report_usage.meter_session", mock_meter):
        await report_usage("jti-001", credits=5, reason="page-view")

    mock_meter.assert_awaited_once_with("jti-001", 5, "page-view", charge_id=None)


async def test_report_usage_forwards_idempotency_key():
    mock_meter = AsyncMock()
    with patch("mythos_sdk.report_usage.meter_session", mock_meter):
        await report_usage("jti-001", credits=1, idempotency_key="charge-123")

    mock_meter.assert_awaited_once_with("jti-001", 1, None, charge_id="charge-123")


async def test_report_usage_propagates_insufficient_funds():
    with patch("mythos_sdk.report_usage.meter_session", new_callable=AsyncMock, side_effect=InsufficientFundsError()):
        with pytest.raises(InsufficientFundsError):
            await report_usage("jti-001", credits=100)


async def test_report_usage_propagates_session_not_found():
    with patch("mythos_sdk.report_usage.meter_session", new_callable=AsyncMock, side_effect=SessionNotFoundError("jti-missing")):
        with pytest.raises(SessionNotFoundError):
            await report_usage("jti-missing", credits=1)
