import re
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from mythos_sdk.api_client import meter_session
from mythos_sdk.errors import InvalidUsageError

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


async def test_meter_session_sends_fresh_uuid_charge_id():
    response = httpx.Response(200, json={}, request=httpx.Request("POST", "https://api.mythos.work/"))
    mock_post = AsyncMock(return_value=response)
    with patch("mythos_sdk.api_client.get_http_client") as mock_client:
        mock_client.return_value.post = mock_post
        await meter_session("jti-001", 5, "page-view")
        await meter_session("jti-001", 5, "page-view")

    bodies = [call.kwargs["json"] for call in mock_post.await_args_list]

    assert UUID_RE.match(bodies[0]["charge_id"])
    assert UUID_RE.match(bodies[1]["charge_id"])
    assert bodies[0]["charge_id"] != bodies[1]["charge_id"]
    assert bodies[0]["credits"] == 5
    assert bodies[0]["reason"] == "page-view"


async def test_meter_session_uses_provided_charge_id():
    response = httpx.Response(200, json={}, request=httpx.Request("POST", "https://api.mythos.work/"))
    mock_post = AsyncMock(return_value=response)
    with patch("mythos_sdk.api_client.get_http_client") as mock_client:
        mock_client.return_value.post = mock_post
        await meter_session("jti-001", 1, charge_id="fixed-charge-id")

    body = mock_post.await_args.kwargs["json"]
    assert body["charge_id"] == "fixed-charge-id"


async def test_meter_session_url_encodes_jti():
    response = httpx.Response(200, json={}, request=httpx.Request("POST", "https://api.mythos.work/"))
    mock_post = AsyncMock(return_value=response)
    with patch("mythos_sdk.api_client.get_http_client") as mock_client:
        mock_client.return_value.post = mock_post
        await meter_session("jti/with/slashes", 1)

    url = mock_post.await_args.args[0]
    assert "/api/apps/sessions/jti%2Fwith%2Fslashes/meter" in url


async def test_meter_session_rejects_invalid_credits():
    with pytest.raises(InvalidUsageError):
        await meter_session("jti-001", 0)

        
async def test_meter_session_reuses_caller_supplied_charge_id():
    response = httpx.Response(200, json={}, request=httpx.Request("POST", "https://api.mythos.work/"))
    mock_post = AsyncMock(return_value=response)
    with patch("httpx.AsyncClient.post", mock_post):
        await meter_session("jti-001", 5, "page-view", charge_id="stable-charge-key")
        await meter_session("jti-001", 5, "page-view", charge_id="stable-charge-key")

    bodies = [call.kwargs["json"] for call in mock_post.await_args_list]

    assert bodies[0]["charge_id"] == "stable-charge-key"
    assert bodies[1]["charge_id"] == "stable-charge-key"
