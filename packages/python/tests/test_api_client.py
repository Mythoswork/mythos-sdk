import re
from unittest.mock import AsyncMock, patch

import httpx

from mythos_sdk.api_client import meter_session

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


async def test_meter_session_sends_fresh_uuid_charge_id():
    response = httpx.Response(200, json={}, request=httpx.Request("POST", "https://api.mythos.work/"))
    mock_post = AsyncMock(return_value=response)
    with patch("httpx.AsyncClient.post", mock_post):
        await meter_session("jti-001", 5, "page-view")
        await meter_session("jti-001", 5, "page-view")

    bodies = [call.kwargs["json"] for call in mock_post.await_args_list]

    assert UUID_RE.match(bodies[0]["charge_id"])
    assert UUID_RE.match(bodies[1]["charge_id"])
    assert bodies[0]["charge_id"] != bodies[1]["charge_id"]
    assert bodies[0]["credits"] == 5
    assert bodies[0]["reason"] == "page-view"
