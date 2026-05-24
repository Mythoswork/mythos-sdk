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
        session = await require_launch_token(lt="valid.token.here")

    assert session.userId == "user-1"
    assert session.sessionJti == "jti-001"


async def test_replay_consume_409_raises_401():
    consume_resp = MagicMock(spec=httpx.Response)
    consume_resp.status_code = 409

    with patch("mythos_sdk.middleware.verify_launch_token", new_callable=AsyncMock, return_value=MOCK_SESSION), \
         patch("mythos_sdk.middleware.consume_session", new_callable=AsyncMock, return_value=consume_resp):
        with pytest.raises(HTTPException) as exc_info:
            await require_launch_token(lt="replayed.token")

    assert exc_info.value.status_code == 401
    assert "consumed" in exc_info.value.detail


async def test_invalid_token_raises_401():
    with patch("mythos_sdk.middleware.verify_launch_token", new_callable=AsyncMock, side_effect=Exception("bad token")):
        with pytest.raises(HTTPException) as exc_info:
            await require_launch_token(lt="bad.token")

    assert exc_info.value.status_code == 401
