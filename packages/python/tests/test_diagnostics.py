import asyncio
import json
import logging
import time
import tomllib
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI
from jose import jwt

from mythos_sdk import diagnostics
from mythos_sdk.constants.diagnostics import DIAGNOSTIC_MESSAGES
from mythos_sdk.errors import InvalidLaunchTokenError, ListingNotRegisteredError, MythosError
from mythos_sdk.mythos import create_mythos
from mythos_sdk.producer_key import hash_producer_key
from mythos_sdk.session import open_session
from mythos_sdk.version import SDK_VERSION

OWN_KEY = "mk_" + "a" * 32
OTHER_KEY = "mk_" + "b" * 32


def mint(keys, **overrides):
    payload = {
        "iss": "mythos", "aud": "listing-abc", "listingId": "listing-abc",
        "sub": "private-user", "email": "private@example.test", "displayName": "Private Person",
        "jti": "diagnostic-jti", "exp": int(time.time()) + 300,
        "pkh": hash_producer_key(OWN_KEY), "test": True, **overrides,
    }
    if overrides.get("test", True) is None:
        payload.pop("test")
    return jwt.encode(payload, keys["private"], algorithm="ES256", headers={"kid": "test-kid"})


@pytest.fixture
async def network(monkeypatch, rsa_key_pair, caplog):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "s" * 32)
    monkeypatch.setenv("MYTHOS_KEY", OWN_KEY)
    caplog.set_level(logging.DEBUG, logger="mythos")
    for module in ("verify", "handshake"):
        monkeypatch.setattr(f"mythos_sdk.{module}.get_jwks", AsyncMock(return_value={"keys": [rsa_key_pair["jwk"]]}))
    calls = []
    settings = {"consume_status": 200, "consume_code": None, "report_error": None}

    async def handle(request):
        calls.append(request)
        if request.url.path.endswith("/diagnostics"):
            if settings["report_error"]:
                raise settings["report_error"]
            return httpx.Response(202, json={"success": True})
        return httpx.Response(settings["consume_status"], json={"code": settings["consume_code"], "data": {
            "llm_identity_token": "private-identity", "llm_identity_expires_at": "2099-01-01T00:00:00Z",
            "session_expires_at": "2099-01-01T00:00:00Z",
        }})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        monkeypatch.setattr("mythos_sdk.api_client.get_http_client", lambda: client)
        monkeypatch.setattr("mythos_sdk.diagnostics.get_http_client", lambda: client)
        yield calls, settings
        await drain()
    assert not diagnostics._tasks


async def drain():
    if diagnostics._tasks:
        await asyncio.gather(*diagnostics._tasks)
    await asyncio.sleep(0)


def reports(calls):
    return [request for request in calls if request.url.path.endswith("/diagnostics")]


def assert_report(calls, code, step):
    posted = reports(calls)
    assert len(posted) == 1
    request = posted[0]
    assert str(request.url) == "https://api.mythos.work/api/apps/sessions/diagnostic-jti/diagnostics"
    assert request.method == "POST"
    assert "authorization" not in request.headers
    assert "cookie" not in request.headers
    assert json.loads(request.content) == {"code": code, "step": step, "sdk_version": "0.5.1"}
    assert request.extensions["timeout"] == dict.fromkeys(("connect", "read", "write", "pool"), 2.0)


async def launch(token, sdk=None):
    app = FastAPI()
    app.include_router((sdk or create_mythos()).router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://app.test") as browser:
        return await browser.get("/api/mythos/session", params={"lt": token})


@pytest.mark.parametrize("test_claim", [True, False, None, "true", 1])
async def test_producer_mismatch_only_reports_literal_test_true(network, rsa_key_pair, caplog, test_claim):
    calls, _ = network
    token = mint(rsa_key_pair, test=test_claim, pkh=hash_producer_key(OTHER_KEY))
    response = await launch(token)
    assert response.status_code == 401
    assert response.json() == {"success": False, "code": "PRODUCER_MISMATCH",
                               "error": "This app is bound to a different Mythos Producer. Check MYTHOS_KEY."}
    assert "set-cookie" not in response.headers
    await drain()
    if test_claim is True:
        assert_report(calls, "PRODUCER_MISMATCH", "verify_launch")
    else:
        assert not calls
    body = str([request.content for request in reports(calls)])
    for value in (token, OWN_KEY, OTHER_KEY, "private-user", "private@example.test", "Private Person"):
        assert value not in caplog.text
        assert value not in body


async def test_unregistered_audience_marker_is_not_message_matching(network, rsa_key_pair, monkeypatch):
    calls, _ = network
    token = mint(rsa_key_pair, aud="unregistered", listingId="unregistered")
    response = await launch(token)
    assert response.status_code == 401
    assert response.json()["code"] == "LISTING_NOT_REGISTERED"
    await drain()
    assert_report(calls, "LISTING_NOT_REGISTERED", "verify_launch")
    from mythos_sdk.verify import verify_launch_token
    with pytest.raises(ListingNotRegisteredError):
        await verify_launch_token(token)
    calls.clear()
    monkeypatch.setattr("mythos_sdk.mythos.verify_launch_token", AsyncMock(side_effect=InvalidLaunchTokenError("Invalid audience")))
    assert (await launch(token)).json()["code"] == "INVALID_LAUNCH_TOKEN"
    await drain()
    assert_report(calls, "INVALID_LAUNCH_TOKEN", "verify_launch")


@pytest.mark.parametrize("status,upstream,code,http_status", [
    (409, None, "TOKEN_ALREADY_CONSUMED", 401),
    (404, "SESSION_EXPIRED", "SESSION_EXPIRED", 401),
    (500, "OTHER", "UPSTREAM_ERROR", 502),
])
async def test_consume_failures(network, rsa_key_pair, status, upstream, code, http_status):
    calls, settings = network
    settings.update(consume_status=status, consume_code=upstream)
    response = await launch(mint(rsa_key_pair))
    assert response.status_code == http_status
    assert response.json()["code"] == code
    await drain()
    assert_report(calls, code, "consume")
    assert len(calls) == 2


async def test_consume_network_failure(network, rsa_key_pair, monkeypatch):
    calls, _ = network
    monkeypatch.setattr("mythos_sdk.mythos.consume_session", AsyncMock(side_effect=httpx.ConnectError("unavailable")))
    assert (await launch(mint(rsa_key_pair))).status_code == 503
    await drain()
    assert_report(calls, "MYTHOS_UNREACHABLE", "consume")


@pytest.mark.parametrize("is_test", [True, False])
async def test_signed_invalid_claims_only_report_test_launches(network, rsa_key_pair, is_test):
    calls, _ = network
    response = await launch(mint(rsa_key_pair, test=is_test, email=None))
    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_LAUNCH_TOKEN"
    await drain()
    if is_test:
        assert_report(calls, "INVALID_LAUNCH_TOKEN", "verify_launch")
    else:
        assert not calls


async def test_real_consume_failure_and_malformed_tokens_never_report(network, rsa_key_pair):
    calls, settings = network
    settings.update(consume_status=409)
    assert (await launch(mint(rsa_key_pair, test=False))).status_code == 401
    await drain()
    assert not reports(calls)
    calls.clear()
    assert (await launch("not-a-token")).status_code == 401
    assert not calls


async def test_jwks_network_failure_reports_exactly_once(network, rsa_key_pair, monkeypatch):
    calls, _ = network
    monkeypatch.setattr("mythos_sdk.verify.get_jwks", AsyncMock(side_effect=httpx.ConnectError("unavailable")))
    response = await launch(mint(rsa_key_pair))
    assert response.status_code == 503
    assert response.json()["code"] == "MYTHOS_UNREACHABLE"
    await drain()
    assert_report(calls, "MYTHOS_UNREACHABLE", "verify_launch")
    assert len(calls) == 1


async def test_configuration_failure_reports_config_error(network, rsa_key_pair, monkeypatch):
    calls, _ = network
    monkeypatch.delenv("MYTHOS_LISTING_ID")
    sdk = create_mythos(resolve_listing_ids=AsyncMock(return_value=[]))
    response = await launch(mint(rsa_key_pair), sdk)
    assert response.status_code == 500
    await drain()
    assert_report(calls, "CONFIG_ERROR", "verify_launch")


async def test_report_rejection_is_swallowed_without_response_changes_or_recursion(network, rsa_key_pair, caplog):
    calls, settings = network
    settings["report_error"] = httpx.ConnectError("private-token private@example.test")
    response = await launch(mint(rsa_key_pair, pkh=hash_producer_key(OTHER_KEY)))
    assert response.status_code == 401
    assert response.json()["code"] == "PRODUCER_MISMATCH"
    await drain()
    assert_report(calls, "PRODUCER_MISMATCH", "verify_launch")
    assert "private-token" not in caplog.text


async def test_report_does_not_inherit_shared_client_cookies_or_credentials(network, rsa_key_pair, monkeypatch):
    calls, _ = network

    def capture(request):
        calls.append(request)
        return httpx.Response(202)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(capture), cookies={"session": "private-cookie"},
        headers={"authorization": "Bearer private-token", "x-mythos-identity": "private-identity"},
        auth=("private@example.test", "private-password"),
    ) as client:
        monkeypatch.setattr("mythos_sdk.diagnostics.get_http_client", lambda: client)
        assert (await launch(mint(rsa_key_pair, pkh=hash_producer_key(OTHER_KEY)))).status_code == 401
        await drain()
    assert_report(calls, "PRODUCER_MISMATCH", "verify_launch")
    assert "x-mythos-identity" not in reports(calls)[0].headers
    assert "private" not in str(reports(calls)[0].headers)


async def test_report_timeout_retains_task_then_cleans_up_without_hot_path_await(network, rsa_key_pair, monkeypatch):
    calls, _ = network
    cancelled = asyncio.Event()

    async def stall(request):
        calls.append(request)
        try:
            await asyncio.sleep(60)
        finally:
            cancelled.set()
        return httpx.Response(202)

    async with httpx.AsyncClient(transport=httpx.MockTransport(stall)) as client:
        monkeypatch.setattr("mythos_sdk.diagnostics.get_http_client", lambda: client)
        response = await launch(mint(rsa_key_pair, pkh=hash_producer_key(OTHER_KEY)))
        assert response.status_code == 401
        assert not cancelled.is_set()
        assert len(diagnostics._tasks) == 1
        await asyncio.wait_for(drain(), timeout=3)
    assert cancelled.is_set()
    assert not diagnostics._tasks
    assert_report(calls, "PRODUCER_MISMATCH", "verify_launch")
    assert len(calls) == 1


async def stored_request(keys, calls, is_test):
    response = await launch(mint(keys, test=is_test))
    data = response.json()["data"]
    assert "isTest" not in data["session"]
    stored = open_session(data["sessionToken"])
    assert stored and stored[0].isTest is is_test
    calls.clear()
    return SimpleNamespace(cookies={}, headers={"x-mythos-session": data["sessionToken"]})


@pytest.mark.parametrize("is_test", [True, False])
async def test_sealed_test_flag_controls_meter_404(network, rsa_key_pair, is_test):
    calls, settings = network
    request = await stored_request(rsa_key_pair, calls, is_test)
    settings.update(consume_status=404, consume_code="SESSION_EXPIRED")
    with pytest.raises(MythosError) as caught:
        await create_mythos().charge(request, credits=1)
    assert caught.value.code == "SESSION_EXPIRED"
    await drain()
    if is_test:
        assert_report(calls, "SESSION_EXPIRED", "meter")
    else:
        assert not reports(calls)


@pytest.mark.parametrize("step", ["meter", "llm"])
async def test_billing_rethrows_identical_error_and_only_reports_enum_codes(network, rsa_key_pair, monkeypatch, step):
    calls, _ = network
    request = await stored_request(rsa_key_pair, calls, True)
    sdk = create_mythos()
    error = MythosError("private@example.test", "SESSION_EXPIRED", 404)
    if step == "meter":
        mock = AsyncMock(side_effect=error)
        monkeypatch.setattr("mythos_sdk.mythos.meter_session", mock)
    else:
        from unittest.mock import Mock
        mock = Mock(side_effect=error)
        monkeypatch.setattr("mythos_sdk.llm.llm", mock)
    with pytest.raises(MythosError) as caught:
        if step == "meter":
            await sdk.charge(request, credits=1)
        else:
            await sdk.llm(request)
    assert caught.value is error
    await drain()
    assert_report(calls, "SESSION_EXPIRED", step)
    assert error.args[0] not in reports(calls)[0].content.decode()
    calls.clear()
    unknown = MythosError("Unknown", "LLM_IDENTITY_REQUIRED")
    mock.side_effect = unknown
    with pytest.raises(MythosError) as caught:
        if step == "meter":
            await sdk.charge(request, credits=1)
        else:
            await sdk.llm(request)
    assert caught.value is unknown
    await drain()
    assert not reports(calls)


async def test_real_llm_failure_rethrows_unchanged_without_reporting(network, rsa_key_pair, monkeypatch):
    from unittest.mock import Mock

    calls, _ = network
    request = await stored_request(rsa_key_pair, calls, False)
    error = MythosError("Expired", "SESSION_EXPIRED", 401)
    monkeypatch.setattr("mythos_sdk.llm.llm", Mock(side_effect=error))
    with pytest.raises(MythosError) as caught:
        await create_mythos().llm(request)
    assert caught.value is error
    await drain()
    assert not calls


async def test_handshake_sub_fallback_logs_listing_only(network, rsa_key_pair, caplog):
    from mythos_sdk.errors import ProducerMismatchError
    from mythos_sdk.producer_key import assert_producer_binding

    with pytest.raises(ProducerMismatchError) as caught:
        assert_producer_binding({"sub": "listing-handshake", "pkh": "wrong"})
    assert caught.value.listing_id == "listing-handshake"
    calls, _ = network
    token = mint(rsa_key_pair, listingId=None, sub="listing-handshake", purpose="handshake-check", pkh="wrong")
    app = FastAPI()
    app.include_router(create_mythos().router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://app.test") as client:
        assert (await client.get("/.well-known/mythos-handshake", params={"lt": token})).status_code == 401
    assert "listing-handshake" in caplog.text
    assert token not in caplog.text
    assert not calls


def test_release_metadata_and_exact_message_maps_match():
    python_root = Path(__file__).resolve().parents[1]
    root = python_root.parents[1]
    assert SDK_VERSION == tomllib.loads((python_root / "pyproject.toml").read_text())["project"]["version"] == "0.5.1"
    node = (root / "packages/node/src/constants/diagnostics.constants.ts").read_text()
    docs = (root / "docs-site/docs/resources/troubleshooting.md").read_text()
    assert len(DIAGNOSTIC_MESSAGES) == 10
    for code, message in DIAGNOSTIC_MESSAGES.items():
        assert f"| `{code}` | {message} |" in docs
        assert f"{code}: {json.dumps(message)}" in node or f"{code}: '{message}'" in node
