import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException

from mythos_sdk import require_launch_token, MythosSession


MOCK_SESSION = MythosSession(
    userId="user-1",
    email="e@e.com",
    displayName="User",
    listingId="listing-abc",
    sessionJti="jti-001",
)


async def test_happy_path_returns_session():
    consume_resp = MagicMock(spec=httpx.Response)
    consume_resp.status_code = 200

    with patch("mythos_sdk.middleware.verify_launch_token", new_callable=AsyncMock, return_value=MOCK_SESSION), \
         patch("mythos_sdk.middleware.consume_session", new_callable=AsyncMock, return_value=consume_resp):
        session = await require_launch_token()(lt="valid.token.here")

    assert session.userId == "user-1"
    assert session.sessionJti == "jti-001"


async def test_missing_lt_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        await require_launch_token(lt=None)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Missing launch token"


async def test_replay_consume_409_raises_401():
    consume_resp = MagicMock(spec=httpx.Response)
    consume_resp.status_code = 409

    with patch("mythos_sdk.middleware.verify_launch_token", new_callable=AsyncMock, return_value=MOCK_SESSION), \
         patch("mythos_sdk.middleware.consume_session", new_callable=AsyncMock, return_value=consume_resp):
        with pytest.raises(HTTPException) as exc_info:
            await require_launch_token()(lt="replayed.token")

    assert exc_info.value.status_code == 401
    assert "consumed" in exc_info.value.detail


async def test_invalid_token_raises_401():
    from mythos_sdk.errors import InvalidLaunchTokenError

    with patch("mythos_sdk.middleware.verify_launch_token", new_callable=AsyncMock,
               side_effect=InvalidLaunchTokenError()):
        with pytest.raises(HTTPException) as exc_info:
            await require_launch_token()(lt="bad.token")

    assert exc_info.value.status_code == 401


async def test_missing_config_raises_500():
    from mythos_sdk.errors import MythosConfigError

    with patch("mythos_sdk.middleware.verify_launch_token", new_callable=AsyncMock,
               side_effect=MythosConfigError("MYTHOS_LISTING_ID or MYTHOS_LISTING_IDS env var is required")):
        with pytest.raises(HTTPException) as exc_info:
            await require_launch_token(lt="valid.token")

    assert exc_info.value.status_code == 500


async def test_consume_500_raises_503():
    consume_resp = MagicMock(spec=httpx.Response)
    consume_resp.status_code = 500

    with patch("mythos_sdk.middleware.verify_launch_token", new_callable=AsyncMock, return_value=MOCK_SESSION), \
         patch("mythos_sdk.middleware.consume_session", new_callable=AsyncMock, return_value=consume_resp):
        with pytest.raises(HTTPException) as exc_info:
            await require_launch_token()(lt="valid.token")

    assert exc_info.value.status_code == 503


async def test_consume_network_error_raises_503():
    with patch("mythos_sdk.middleware.verify_launch_token", new_callable=AsyncMock, return_value=MOCK_SESSION), \
         patch("mythos_sdk.middleware.consume_session", new_callable=AsyncMock,
               side_effect=httpx.ConnectError("connection refused")):
        with pytest.raises(HTTPException) as exc_info:
            await require_launch_token()(lt="valid.token")

    assert exc_info.value.status_code == 503


async def test_resolve_listing_ids_forwarded_to_verify():
    # Regression: require_launch_token() must forward resolve_listing_ids through
    # to verify_launch_token so dynamic-only (no static env var) listings work.
    consume_resp = MagicMock(spec=httpx.Response)
    consume_resp.status_code = 200
    resolve_ids = AsyncMock(return_value=["listing-dynamic"])

    with patch("mythos_sdk.middleware.verify_launch_token", new_callable=AsyncMock, return_value=MOCK_SESSION) as mock_verify, \
         patch("mythos_sdk.middleware.consume_session", new_callable=AsyncMock, return_value=consume_resp):
        session = await require_launch_token(resolve_listing_ids=resolve_ids)(lt="valid.token.here")

    mock_verify.assert_awaited_once_with("valid.token.here", resolve_ids)
    assert session.userId == "user-1"
