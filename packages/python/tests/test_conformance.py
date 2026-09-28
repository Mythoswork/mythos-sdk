import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from mythos_sdk.api_client import meter_session, refresh_session
from mythos_sdk.errors import MythosError, MythosUpstreamError
from mythos_sdk.mythos import Mythos
from mythos_sdk.session import _seal_session_with_nonce, open_session
from mythos_sdk.types import MythosSession


CONFORMANCE = Path(__file__).resolve().parents[3] / "conformance"
SESSIONS = json.loads((CONFORMANCE / "session-v1.json").read_text())
ERRORS = json.loads((CONFORMANCE / "errors.json").read_text())
CHARGE = json.loads((CONFORMANCE / "charge-request.json").read_text())


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", SESSIONS["secret"])
    monkeypatch.setenv("MYTHOS_LISTING_ID", "listing-456")
    monkeypatch.setenv("MYTHOS_API_URL", "https://api.mythos.work")


@pytest.mark.parametrize("vector", SESSIONS["valid"], ids=lambda vector: vector["name"])
def test_session_v1_valid(vector):
    payload = vector["payload"]
    session = MythosSession(**{key: value for key, value in payload.items() if key != "expiresAt"})
    assert _seal_session_with_nonce(session, payload["expiresAt"], bytes.fromhex(vector["iv_hex"])) == vector["token"]
    assert open_session(vector["token"]) == (session, payload["expiresAt"])


@pytest.mark.parametrize("vector", SESSIONS["invalid"], ids=lambda vector: vector["name"])
def test_session_v1_invalid(vector):
    assert open_session(vector["token"]) is None


@pytest.mark.parametrize("vector", ERRORS, ids=lambda vector: f'{vector["endpoint"]}-{vector["status"]}-{vector["code"]}')
async def test_error_mapping(vector):
    endpoint, status, code, expected = (vector[key] for key in ("endpoint", "status", "code", "expect"))
    response = httpx.Response(status, json={"code": code} if code is not None else {})
    post = AsyncMock(return_value=response)
    with patch("mythos_sdk.api_client.get_http_client") as client:
        client.return_value.post = post
        if endpoint == "consume":
            request = SimpleNamespace(query_params={"lt": "launch"}, cookies={}, headers={})
            incoming = MythosSession(**{
                key: value for key, value in SESSIONS["valid"][0]["payload"].items() if key != "expiresAt"
            })
            with patch("mythos_sdk.mythos.verify_launch_token", new=AsyncMock(return_value=incoming)):
                mapped_status, body, _, _ = await Mythos().handle_session(request)
            assert {"code": body["code"], "httpStatus": mapped_status} == expected
        else:
            operation = (meter_session("session-789", 100, "calc", CHARGE["input"]["idempotencyKey"])
                         if endpoint == "meter" else refresh_session("session-789", "identity.jwt.token"))
            if expected == "null":
                assert await operation is None
            else:
                with pytest.raises(MythosError) as caught:
                    await operation
                error = caught.value
                assert {"code": error.code, "httpStatus": error.http_status} == expected
                if isinstance(error, MythosUpstreamError) and status != 200:
                    assert (error.upstream_status, error.upstream_code) == (status, code)
    post.assert_awaited_once()
    assert post.await_args.args[0].endswith(f"/{endpoint}")


async def test_charge_request_body():
    post = AsyncMock(return_value=httpx.Response(200, json={"data": {}}))
    with patch("mythos_sdk.api_client.get_http_client") as client:
        client.return_value.post = post
        await meter_session("session-789", CHARGE["input"]["credits"], CHARGE["input"]["reason"],
                            CHARGE["input"]["idempotencyKey"])
    assert post.await_args.kwargs["json"] == CHARGE["body"]
    assert post.await_args.args[0].endswith("/api/apps/sessions/session-789/meter")
