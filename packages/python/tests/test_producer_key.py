import logging
import time
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import Depends, FastAPI
from jose import jwt

from mythos_sdk import InvalidLaunchTokenError, MythosConfigError, ProducerMismatchError
from mythos_sdk import producer_key
from mythos_sdk.constants.producer_key import (
    MALFORMED_PRODUCER_KEY_MESSAGE,
    MISSING_PRODUCER_KEY_WARNING,
    PRODUCER_MISMATCH_MESSAGE,
)
from mythos_sdk.handshake import create_handshake_router
from mythos_sdk.listing_callback import create_listing_callback_handler
from mythos_sdk.middleware import require_launch_token
from mythos_sdk.mythos import create_mythos
from mythos_sdk.producer_key import hash_producer_key
from mythos_sdk.types import MythosSession


OWN_KEY = "mk_" + "a" * 32
OTHER_KEY = "mk_" + "b" * 32
OWN_HASH = hash_producer_key(OWN_KEY)
OTHER_HASH = hash_producer_key(OTHER_KEY)
SESSION_PATH = "/api/mythos/session"
HANDSHAKE_PATH = "/.well-known/mythos-handshake"
CALLBACK_PATH = "/.well-known/mythos-listing-registered"
MISMATCH_BODY = {
    "success": False,
    "error": PRODUCER_MISMATCH_MESSAGE,
    "code": "PRODUCER_MISMATCH",
}


def mint_token(
    private_key: bytes,
    pkh: object = None,
    *,
    purpose: str | None = None,
    listing_id: str = "listing-abc",
    jti: str = "producer-jti",
) -> str:
    payload: dict[str, object] = {
        "sub": "user-1",
        "email": "user@example.test",
        "displayName": "User",
        "listingId": listing_id,
        "aud": listing_id,
        "iss": "mythos",
        "jti": jti,
        "exp": int(time.time()) + 300,
    }
    if pkh is not None:
        payload["pkh"] = pkh
    if purpose is not None:
        payload["purpose"] = purpose
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": "test-kid"})


def browser(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://app.test")


def assert_safe_logs(caplog, token: str) -> None:
    for value in (OWN_KEY, OTHER_KEY, OWN_HASH, OTHER_HASH, token):
        assert value not in caplog.text
    assert "pkh" not in caplog.text


@pytest.fixture(autouse=True)
def producer_test_environment(monkeypatch, rsa_key_pair, caplog):
    monkeypatch.setenv("MYTHOS_SESSION_SECRET", "s" * 32)
    monkeypatch.setattr(producer_key, "_has_warned_missing_producer_key", False)
    caplog.set_level(logging.WARNING, logger="mythos")
    for module in ("verify", "handshake", "listing_callback"):
        for getter in ("get_jwks", "get_jwks_with_kid_fallback"):
            monkeypatch.setattr(
                f"mythos_sdk.{module}.{getter}",
                AsyncMock(return_value={"keys": [rsa_key_pair["jwk"]]}),
            )


@pytest.fixture
async def consume_requests(monkeypatch):
    requests: list[httpx.Request] = []

    def consume(request: httpx.Request) -> httpx.Response:
        assert request.url.path.startswith("/api/apps/sessions/")
        assert request.url.path.endswith("/consume")
        requests.append(request)
        return httpx.Response(200, json={"success": True, "data": {
            "llm_identity_token": "identity",
            "llm_identity_expires_at": "2099-01-01T00:30:00Z",
        }})

    async with httpx.AsyncClient(transport=httpx.MockTransport(consume)) as client:
        monkeypatch.setattr("mythos_sdk.api_client.get_http_client", lambda: client)
        yield requests


@pytest.mark.parametrize("pkh", [OWN_HASH, OTHER_HASH, None, 123, [OWN_HASH]])
async def test_session_producer_binding(monkeypatch, rsa_key_pair, consume_requests, caplog, pkh):
    monkeypatch.setenv("MYTHOS_KEY", OWN_KEY)
    app = FastAPI()
    app.include_router(create_mythos().router)
    token = mint_token(rsa_key_pair["private"], pkh)
    async with browser(app) as client:
        response = await client.get(SESSION_PATH, params={"lt": token})
    if pkh == OWN_HASH:
        assert response.status_code == 200
        assert response.json()["data"]["session"]["listingId"] == "listing-abc"
        assert len(consume_requests) == 1
    else:
        assert response.status_code == 401
        assert response.json() == MISMATCH_BODY
        assert "set-cookie" not in response.headers
        assert not consume_requests
        assert "[mythos] session: producer mismatch" in caplog.text
        assert "listing-abc" in caplog.text
    assert_safe_logs(caplog, token)


@pytest.mark.parametrize("pkh", [OWN_HASH, OTHER_HASH, None])
@pytest.mark.parametrize("plural", [False, True])
async def test_unbound_static_session_is_silent(monkeypatch, rsa_key_pair, consume_requests, caplog, pkh, plural):
    if plural:
        monkeypatch.setenv("MYTHOS_LISTING_IDS", "listing-other, listing-abc")
    app = FastAPI()
    app.include_router(create_mythos().router)
    async with browser(app) as client:
        response = await client.get(SESSION_PATH, params={"lt": mint_token(rsa_key_pair["private"], pkh)})
    assert response.status_code == 200
    assert len(consume_requests) == 1
    assert not caplog.records


async def test_dynamic_startup_warning_counts_once_across_apps_and_endpoints(rsa_key_pair, consume_requests, caplog):
    resolve = AsyncMock(return_value=["listing-dynamic"])
    registered = AsyncMock()
    app = FastAPI()
    app.include_router(create_mythos(resolve_listing_ids=resolve, on_listing_registered=registered).router)
    create_mythos(resolve_listing_ids=resolve)
    assert caplog.messages == ["[mythos] " + MISSING_PRODUCER_KEY_WARNING]
    async with browser(app) as client:
        for jti in ("first", "second"):
            token = mint_token(rsa_key_pair["private"], OTHER_HASH, listing_id="listing-dynamic", jti=jti)
            response = await client.get(SESSION_PATH, params={"lt": token})
            assert response.status_code == 200
            assert_safe_logs(caplog, token)
        handshake = await client.get(HANDSHAKE_PATH, params={
            "lt": mint_token(rsa_key_pair["private"], purpose="handshake-check"),
        })
        callback = await client.post(CALLBACK_PATH, params={
            "lt": mint_token(rsa_key_pair["private"], purpose="listing_registered", listing_id="listing-new"),
        })
    assert handshake.status_code == callback.status_code == 200
    registered.assert_awaited_once_with("listing-new")
    assert len(consume_requests) == 2
    assert caplog.messages == ["[mythos] " + MISSING_PRODUCER_KEY_WARNING]


@pytest.mark.parametrize("option", ["resolver", "callback", "both"])
def test_missing_key_warns_at_startup_for_each_dynamic_option(caplog, option):
    create_mythos(
        resolve_listing_ids=AsyncMock() if option != "callback" else None,
        on_listing_registered=AsyncMock() if option != "resolver" else None,
    )
    assert caplog.messages == ["[mythos] " + MISSING_PRODUCER_KEY_WARNING]


@pytest.mark.parametrize("pkh", [OWN_HASH, OTHER_HASH, None])
@pytest.mark.parametrize("standalone", [False, True])
async def test_handshake_binding(monkeypatch, rsa_key_pair, caplog, pkh, standalone):
    monkeypatch.setenv("MYTHOS_KEY", OWN_KEY)
    app = FastAPI()
    app.include_router(create_handshake_router() if standalone else create_mythos().router)
    token = mint_token(rsa_key_pair["private"], pkh, purpose="handshake-check")
    async with browser(app) as client:
        response = await client.get(HANDSHAKE_PATH, params={"lt": token})
    if pkh == OWN_HASH:
        assert response.status_code == 200
        assert response.json()["ok"] is True
        assert response.json()["sdk_version"] == "0.5.0"
        assert not caplog.records
    else:
        assert response.status_code == 401
        assert response.json() == {"error": "Producer mismatch"}
        assert "[mythos] handshake: producer mismatch" in caplog.text
        assert "listing-abc" in caplog.text
    assert_safe_logs(caplog, token)


@pytest.mark.parametrize("pkh", [OWN_HASH, OTHER_HASH, None])
@pytest.mark.parametrize("standalone", [False, True])
async def test_callback_binding(monkeypatch, rsa_key_pair, caplog, pkh, standalone):
    monkeypatch.setenv("MYTHOS_KEY", OWN_KEY)
    registered = AsyncMock()
    app = FastAPI()
    if standalone:
        app.add_api_route(CALLBACK_PATH, create_listing_callback_handler(registered), methods=["GET", "POST"])
    else:
        app.include_router(create_mythos(on_listing_registered=registered).router)
    token = mint_token(rsa_key_pair["private"], pkh, purpose="listing_registered", listing_id="listing-new")
    async with browser(app) as client:
        response = await client.post(CALLBACK_PATH, params={"lt": token})
    if pkh == OWN_HASH:
        assert response.status_code == 200
        assert response.json() == {"ok": True}
        registered.assert_awaited_once_with("listing-new")
        assert not caplog.records
    else:
        assert response.status_code == 401
        assert response.json() == {"error": "Producer mismatch"}
        registered.assert_not_awaited()
        assert "[mythos] listing-callback: producer mismatch" in caplog.text
        assert "listing-new" in caplog.text
    assert_safe_logs(caplog, token)


@pytest.mark.parametrize("pkh", [OWN_HASH, OTHER_HASH, None])
async def test_unbound_handshake_and_callback_share_one_runtime_warning(rsa_key_pair, caplog, pkh):
    registered = AsyncMock()
    app = FastAPI()
    app.include_router(create_handshake_router())
    app.add_api_route(CALLBACK_PATH, create_listing_callback_handler(registered), methods=["GET", "POST"])
    assert not caplog.records
    async with browser(app) as client:
        for path, purpose in ((HANDSHAKE_PATH, "handshake-check"), (CALLBACK_PATH, "listing_registered")):
            token = mint_token(rsa_key_pair["private"], pkh, purpose=purpose)
            for _ in range(2):
                response = await client.get(path, params={"lt": token})
                assert response.status_code == 200
            assert_safe_logs(caplog, token)
    assert registered.await_count == 2
    assert caplog.messages == ["[mythos] " + MISSING_PRODUCER_KEY_WARNING]


async def test_hijack_callback_does_not_store_listing_and_preseeded_launch_is_rejected(
    monkeypatch, rsa_key_pair, consume_requests, caplog,
):
    monkeypatch.setenv("MYTHOS_KEY", OWN_KEY)
    listings: list[str] = []

    async def resolve() -> list[str]:
        return list(listings)

    async def register(listing_id: str) -> None:
        listings.append(listing_id)

    app = FastAPI()
    app.include_router(create_mythos(resolve_listing_ids=resolve, on_listing_registered=register).router)
    callback_token = mint_token(
        rsa_key_pair["private"], OTHER_HASH, purpose="listing_registered", listing_id="listing-b",
    )
    launch_token = mint_token(rsa_key_pair["private"], OTHER_HASH, listing_id="listing-b")
    async with browser(app) as client:
        callback = await client.post(CALLBACK_PATH, params={"lt": callback_token})
        assert callback.status_code == 401
        assert callback.json() == {"error": "Producer mismatch"}
        assert listings == []
        listings.append("listing-b")
        launch = await client.get(SESSION_PATH, params={"lt": launch_token})
    assert launch.status_code == 401
    assert launch.json() == MISMATCH_BODY
    assert not consume_requests
    assert_safe_logs(caplog, callback_token)
    assert_safe_logs(caplog, launch_token)


@pytest.mark.parametrize("key", ["foo", "mk_test", "mk_" + "a" * 31, "mk_" + "a" * 33, "mk_" + "+" * 32])
def test_malformed_key_rejected_at_startup(monkeypatch, key):
    monkeypatch.setenv("MYTHOS_KEY", key)
    with pytest.raises(MythosConfigError) as error:
        create_mythos()
    assert str(error.value) == MALFORMED_PRODUCER_KEY_MESSAGE


@pytest.mark.parametrize("key", [OWN_KEY, " \t" + OWN_KEY + "\n", "mk_" + "A0_-" * 8, "", " \t\n"])
def test_valid_or_empty_key_startup(monkeypatch, caplog, key):
    monkeypatch.setenv("MYTHOS_KEY", key)
    assert create_mythos()
    assert producer_key.read_producer_key() == (key.strip() or None)
    assert not caplog.records


@pytest.mark.parametrize("pkh", [OTHER_HASH, None])
async def test_legacy_dependency_mismatch_keeps_invalid_token_response(monkeypatch, rsa_key_pair, consume_requests, pkh):
    monkeypatch.setenv("MYTHOS_KEY", OWN_KEY)
    app = FastAPI()

    @app.get("/protected")
    async def protected(session: MythosSession = Depends(require_launch_token())) -> dict[str, str]:
        return {"listingId": session.listingId}

    async with browser(app) as client:
        mismatch = await client.get("/protected", params={"lt": mint_token(rsa_key_pair["private"], pkh)})
        invalid = await client.get("/protected", params={"lt": "invalid-token"})
    assert mismatch.status_code == invalid.status_code == 401
    assert mismatch.json() == invalid.json() == {"detail": "Invalid launch token"}
    assert not consume_requests


async def test_legacy_dynamic_launch_warns_at_runtime_once(rsa_key_pair, consume_requests, caplog):
    app = FastAPI()
    resolve = AsyncMock(return_value=["listing-dynamic"])

    @app.get("/protected")
    async def protected(session: MythosSession = Depends(require_launch_token(resolve))) -> dict[str, str]:
        return {"listingId": session.listingId}

    assert not caplog.records
    async with browser(app) as client:
        for jti in ("first", "second"):
            response = await client.get("/protected", params={
                "lt": mint_token(rsa_key_pair["private"], listing_id="listing-dynamic", jti=jti),
            })
            assert response.status_code == 200
            assert response.json() == {"listingId": "listing-dynamic"}
    assert len(consume_requests) == 2
    assert caplog.messages == ["[mythos] " + MISSING_PRODUCER_KEY_WARNING]


def test_public_mismatch_error_preserves_invalid_token_inheritance():
    error = ProducerMismatchError()
    assert isinstance(error, InvalidLaunchTokenError)
    assert error.http_status == 401
    assert error.code == "PRODUCER_MISMATCH"
    assert str(error) == PRODUCER_MISMATCH_MESSAGE


@pytest.mark.parametrize(
    ("payload", "expected"),
    [({"sub": "listing-h"}, "listing-h"), ({"sub": "user-a", "listingId": "listing-a"}, "listing-a")],
)
def test_mismatch_listing_id_falls_back_to_sub(monkeypatch, payload, expected):
    monkeypatch.setenv("MYTHOS_KEY", OWN_KEY)
    with pytest.raises(ProducerMismatchError) as caught:
        producer_key.assert_producer_binding({**payload, "pkh": OTHER_HASH})
    assert caught.value.listing_id == expected
