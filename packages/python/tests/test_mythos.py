import importlib
import sys
import time
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI
from jose import jwt
from httpx import ASGITransport

from mythos_sdk.errors import MythosConfigError, SessionRequiredError
from mythos_sdk.mythos import SESSION_COOKIE, SESSION_HEADER, create_mythos
from mythos_sdk.session import open_session, seal_session
from mythos_sdk.types import MythosSession


SESSION = MythosSession(
    userId="user-1",
    email="a@b.c",
    displayName="A",
    listingId="listing-abc",
    sessionJti="jti-1",
)


def request_like(*, cookie: str | None = None, session_header: str | None = None, lt: str | None = None, scheme: str = "https"):
    headers = {}
    cookies = {}
    if cookie is not None:
        cookies[SESSION_COOKIE] = cookie
    if session_header is not None:
        headers[SESSION_HEADER] = session_header
    return SimpleNamespace(
        headers=headers,
        cookies=cookies,
        url=SimpleNamespace(scheme=scheme),
        query_params={"lt": lt} if lt else {},
    )


def mint_launch_token(private_key: bytes, jti: str = "jti-1", exp: int | None = None) -> str:
    payload = {
        "sub": "user-1",
        "email": "a@b.c",
        "displayName": "A",
        "listingId": "listing-abc",
        "iss": "mythos",
        "aud": "listing-abc",
        "jti": jti,
        "exp": exp or int(time.time()) + 300,
    }
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": "test-kid"})


def mock_http_client(consume_response: httpx.Response | None = None, meter_response: httpx.Response | None = None):
    client = SimpleNamespace(
        post=AsyncMock(side_effect=[consume_response or httpx.Response(
            200,
            json={"success": True, "data": {
                "llm_identity_token": "identity-token",
                "llm_identity_expires_at": "2099-01-01T00:30:00Z",
            }},
            request=httpx.Request("POST", "https://api.mythos.work/consume"),
        ), meter_response or httpx.Response(
            200,
            json={"success": True, "data": {"session_metered_total": 3}},
            request=httpx.Request("POST", "https://api.mythos.work/meter"),
        )]),
    )
    return client


def mock_jwks(rsa_key_pair):
    return patch("mythos_sdk.verify.get_jwks", new_callable=AsyncMock, return_value={"keys": [rsa_key_pair["jwk"]]})


def test_create_mythos_validates_secret_length_and_listing_config(monkeypatch):
    monkeypatch.delenv("MYTHOS_SESSION_SECRET", raising=False)
    with pytest.raises(MythosConfigError, match="MYTHOS_SESSION_SECRET"):
        create_mythos()
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "short")
    with pytest.raises(MythosConfigError, match="at least 32"):
        create_mythos()
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    monkeypatch.delenv("MYTHOS_LISTING_ID", raising=False)
    with pytest.raises(MythosConfigError, match="MYTHOS_LISTING_ID"):
        create_mythos()
    assert create_mythos(resolve_listing_ids=AsyncMock())


def test_create_mythos_rejects_invalid_api_url(monkeypatch):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    monkeypatch.setenv("MYTHOS_API_URL", "ftp://api.mythos.work")
    with pytest.raises(MythosConfigError, match=r"valid http\(s\) URL"):
        create_mythos()


def test_core_import_and_create_mythos_do_not_load_fastapi(monkeypatch):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    monkeypatch.setitem(sys.modules, "fastapi", None)
    mythos_module = importlib.reload(sys.modules["mythos_sdk.mythos"])
    assert mythos_module.create_mythos()
    assert sys.modules["fastapi"] is None


async def test_first_consume_returns_public_session_and_sealed_cookie(monkeypatch, rsa_key_pair):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    client = mock_http_client()
    token = mint_launch_token(rsa_key_pair["private"])
    sdk = create_mythos()
    with mock_jwks(rsa_key_pair), patch("mythos_sdk.api_client.get_http_client", return_value=client):
        status, body, session_token, expires_at = await sdk.handle_session(request_like(lt=token))

    assert status == 200
    assert body["data"]["session"]["sessionJti"] == "jti-1"
    assert body["data"]["session"]["llmIdentityToken"] is None
    assert body["data"]["sessionToken"] == session_token
    assert expires_at == "2099-01-01T00:30:00Z"
    assert open_session(session_token) is not None
    client.post.assert_awaited_once()


async def test_same_lt_reuses_cookie_and_page_switch_needs_no_lt(monkeypatch, rsa_key_pair):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    client = mock_http_client()
    token = mint_launch_token(rsa_key_pair["private"])
    sdk = create_mythos()
    with mock_jwks(rsa_key_pair), patch("mythos_sdk.api_client.get_http_client", return_value=client):
        _status, _body, session_token, _expiry = await sdk.handle_session(request_like(lt=token))
        status, reused_body, reused_token, _expiry = await sdk.handle_session(request_like(cookie=session_token, lt=token))
        switch_status, switch_body, _switch_token, _switch_expiry = await sdk.handle_session(request_like(cookie=session_token))
        standalone_status, standalone_body, _none, _no_expiry = await sdk.handle_session(request_like())

    assert status == switch_status == standalone_status == 200
    assert reused_token is None
    assert reused_body["data"]["sessionToken"]
    assert switch_body["data"]["session"]["sessionJti"] == "jti-1"
    assert standalone_body["data"] is None
    client.post.assert_awaited_once()


async def test_new_lt_replaces_stale_cookie(monkeypatch, rsa_key_pair):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    client = mock_http_client()
    sdk = create_mythos()
    old_token = mint_launch_token(rsa_key_pair["private"], "jti-old")
    new_token = mint_launch_token(rsa_key_pair["private"], "jti-new")
    with mock_jwks(rsa_key_pair), patch("mythos_sdk.api_client.get_http_client", return_value=client):
        _status, _body, old_session_token, _expiry = await sdk.handle_session(request_like(lt=old_token))
        status, body, _new_session_token, _expiry = await sdk.handle_session(
            request_like(cookie=old_session_token, lt=new_token)
        )
    assert status == 200
    assert body["data"]["session"]["sessionJti"] == "jti-new"
    assert client.post.await_count == 2


async def test_expired_cookie_is_absent_and_charge_requires_session(monkeypatch):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    sdk = create_mythos()
    expired_token = seal_session(SESSION, "2000-01-01T00:00:00Z")
    assert await sdk.get_session(request_like(cookie=expired_token)) is None
    with pytest.raises(SessionRequiredError):
        await sdk.charge(request_like(cookie=expired_token), credits=1)


async def test_header_session_transport_and_charge_result(monkeypatch):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    client = SimpleNamespace(post=AsyncMock(return_value=httpx.Response(
        200,
        json={"success": True, "data": {"session_metered_total": 3}},
        request=httpx.Request("POST", "https://api.mythos.work/meter"),
    )))
    session_token = seal_session(replace(SESSION, llmIdentityToken="identity-token"), "2099-01-01T00:00:00Z")
    sdk = create_mythos()
    with patch("mythos_sdk.api_client.get_http_client", return_value=client):
        public_session = await sdk.get_session(request_like(session_header=session_token))
        charge = await sdk.charge(request_like(session_header=session_token), credits=1, idempotency_key="k-1")
    assert public_session is not None and public_session.llmIdentityToken is None
    assert charge.charge_id == "k-1"
    assert charge.session_metered_total == 3
    assert client.post.await_args_list[-1].kwargs["json"]["charge_id"] == "k-1"


async def test_consume_409_maps_to_token_consumed(monkeypatch, rsa_key_pair):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    consume_response = httpx.Response(409, json={}, request=httpx.Request("POST", "https://api.mythos.work/consume"))
    client = mock_http_client(consume_response=consume_response)
    sdk = create_mythos()
    with mock_jwks(rsa_key_pair), patch("mythos_sdk.api_client.get_http_client", return_value=client):
        status, body, _token, _expiry = await sdk.handle_session(
            request_like(lt=mint_launch_token(rsa_key_pair["private"]))
        )
    assert status == 401
    assert body["code"] == "TOKEN_ALREADY_CONSUMED"


async def test_consume_upstream_failure_logs_and_returns_502(monkeypatch, rsa_key_pair, caplog):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    consume_response = httpx.Response(
        500,
        json={"code": "CONFIG_ERROR"},
        request=httpx.Request("POST", "https://api.mythos.work/consume"),
    )
    client = mock_http_client(consume_response=consume_response)
    sdk = create_mythos()
    with mock_jwks(rsa_key_pair), patch("mythos_sdk.api_client.get_http_client", return_value=client):
        status, body, _token, _expiry = await sdk.handle_session(
            request_like(lt=mint_launch_token(rsa_key_pair["private"]))
        )
    assert status == 502
    assert body["code"] == "UPSTREAM_ERROR"
    assert "[mythos] session: consume returned 500" in caplog.text


async def test_jwks_network_failure_returns_logged_503(monkeypatch, rsa_key_pair, caplog):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    sdk = create_mythos()
    with patch("mythos_sdk.verify.get_jwks", new_callable=AsyncMock, side_effect=httpx.ConnectError("offline")):
        status, body, _token, _expiry = await sdk.handle_session(
            request_like(lt=mint_launch_token(rsa_key_pair["private"]))
        )
    assert status == 503
    assert body["code"] == "MYTHOS_UNREACHABLE"
    assert "[mythos] session: could not verify launch token" in caplog.text


async def test_expired_lt_reload_with_matching_cookie(monkeypatch, rsa_key_pair):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    client = mock_http_client()
    sdk = create_mythos()
    with mock_jwks(rsa_key_pair), patch("mythos_sdk.api_client.get_http_client", return_value=client):
        _status, _body, token, _expiry = await sdk.handle_session(
            request_like(lt=mint_launch_token(rsa_key_pair["private"], "jti-1"))
        )
        status, body, _new_token, _expiry = await sdk.handle_session(
            request_like(cookie=token, lt=mint_launch_token(rsa_key_pair["private"], "jti-1", int(time.time()) - 10))
        )
    assert status == 200
    assert body["data"]["session"]["sessionJti"] == "jti-1"
    client.post.assert_awaited_once()


async def test_session_router_sets_partitioned_secure_cookie(monkeypatch, rsa_key_pair):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    client = mock_http_client()
    sdk = create_mythos()
    app = FastAPI()
    app.include_router(sdk.router)
    async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="https://app.test") as test_client:
        with mock_jwks(rsa_key_pair), patch("mythos_sdk.api_client.get_http_client", return_value=client):
            response = await test_client.get(
                "/api/mythos/session",
                params={"lt": mint_launch_token(rsa_key_pair["private"])},
            )
    assert response.status_code == 200
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=none" in response.headers["set-cookie"].lower()
    assert "secure" in response.headers["set-cookie"].lower()
    assert "partitioned" in response.headers["set-cookie"].lower()


async def test_dev_session_cookie_uses_lax_without_secure(monkeypatch, rsa_key_pair):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    client = mock_http_client()
    sdk = create_mythos()
    app = FastAPI()
    app.include_router(sdk.router)
    with mock_jwks(rsa_key_pair), patch("mythos_sdk.api_client.get_http_client", return_value=client):
        async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as test_client:
            response = await test_client.get(
                "/api/mythos/session",
                params={"lt": mint_launch_token(rsa_key_pair["private"])},
            )
    assert response.status_code == 200
    cookie = response.headers["set-cookie"].lower()
    assert "samesite=lax" in cookie
    assert "secure" not in cookie


async def test_handshake_router_keeps_legacy_contract(monkeypatch, rsa_key_pair):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    sdk = create_mythos()
    from mythos_sdk.handshake import _validate_handshake_token

    app = FastAPI()
    with patch("mythos_sdk.handshake._validate_handshake_token", new_callable=AsyncMock):
        app.include_router(sdk.router)
        async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="https://app.test") as test_client:
            missing = await test_client.get("/.well-known/mythos-handshake")
            valid = await test_client.get("/.well-known/mythos-handshake", params={"lt": "handshake-token"})
    assert missing.status_code == 401
    assert missing.json() == {"error": "Missing launch token"}
    assert valid.status_code == 200
    assert valid.json()["sdk_version"]


async def test_listing_callback_route_registered_when_callback_configured(monkeypatch):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    callback = AsyncMock()
    sdk = create_mythos(on_listing_registered=callback)
    app = FastAPI()
    with patch("mythos_sdk.listing_callback._validate_listing_callback_token", new_callable=AsyncMock, return_value="listing-registered"):
        app.include_router(sdk.router)
        async with httpx.AsyncClient(transport=ASGITransport(app=app), base_url="https://app.test") as client:
            response = await client.post("/.well-known/mythos-listing-registered", params={"lt": "callback-token"})
    assert response.status_code == 200
    callback.assert_awaited_once_with("listing-registered")


async def test_llm_fallback_and_billing_metadata(monkeypatch):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "x" * 32)
    sdk = create_mythos()
    assert await sdk.llm(request_like(), fallback="FB") == "FB"
    assert sdk.billing({"mythos_cost_microunits": "5", "mythos_pricing_source": "rate_card"}) == {
        "mythos_cost_microunits": "5",
        "mythos_pricing_source": "rate_card",
    }


async def test_meter_session_maps_expired_and_network_errors():
    from mythos_sdk.api_client import meter_session
    from mythos_sdk.errors import InsufficientFundsError, MythosUnreachableError, SessionExpiredError

    expired = httpx.Response(
        404,
        json={"code": "SESSION_EXPIRED"},
        request=httpx.Request("POST", "https://api.mythos.work/meter"),
    )
    with patch("mythos_sdk.api_client.get_http_client") as get_client:
        get_client.return_value.post = AsyncMock(return_value=expired)
        with pytest.raises(SessionExpiredError):
            await meter_session("jti-1", 1)
    insufficient = httpx.Response(
        402,
        json={"code": "INSUFFICIENT_FUNDS"},
        request=httpx.Request("POST", "https://api.mythos.work/meter"),
    )
    with patch("mythos_sdk.api_client.get_http_client") as get_client:
        get_client.return_value.post = AsyncMock(return_value=insufficient)
        with pytest.raises(InsufficientFundsError):
            await meter_session("jti-1", 1)
    with patch("mythos_sdk.api_client.get_http_client") as get_client:
        get_client.return_value.post = AsyncMock(side_effect=httpx.ConnectError("offline"))
        with pytest.raises(MythosUnreachableError):
            await meter_session("jti-1", 1)
