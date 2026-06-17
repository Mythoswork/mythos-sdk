from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import JWTError

from mythos_sdk import SDK_VERSION, create_handshake_router, handshake_router


def test_default_handshake_router_returns_ok():
    app = FastAPI()
    app.include_router(handshake_router)

    client = TestClient(app)
    with patch("mythos_sdk.handshake._verify_handshake_token", new_callable=AsyncMock):
        response = client.get("/.well-known/mythos-handshake?lt=valid.token.here")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "sdk_version": SDK_VERSION}


def test_create_handshake_router_returns_ok():
    app = FastAPI()
    app.include_router(create_handshake_router())

    client = TestClient(app)
    with patch("mythos_sdk.handshake._verify_handshake_token", new_callable=AsyncMock):
        response = client.get("/.well-known/mythos-handshake?lt=valid.token.here")

    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_missing_lt_returns_422():
    app = FastAPI()
    app.include_router(create_handshake_router())

    client = TestClient(app)
    response = client.get("/.well-known/mythos-handshake")

    assert response.status_code == 422


def test_invalid_token_returns_401():
    app = FastAPI()
    app.include_router(create_handshake_router())

    client = TestClient(app)
    with patch(
        "mythos_sdk.handshake._verify_handshake_token",
        new_callable=AsyncMock,
        side_effect=JWTError("bad sig"),
    ):
        response = client.get("/.well-known/mythos-handshake?lt=bad.token")

    assert response.status_code == 401
