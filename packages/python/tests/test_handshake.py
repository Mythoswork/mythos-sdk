from fastapi import FastAPI
from fastapi.testclient import TestClient

from mythos_sdk import create_handshake_router, handshake_router, SDK_VERSION


def test_default_handshake_router_returns_ok():
    app = FastAPI()
    app.include_router(handshake_router)

    client = TestClient(app)
    response = client.get("/.well-known/mythos-handshake")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "sdk_version": SDK_VERSION}


def test_create_handshake_router_returns_ok():
    app = FastAPI()
    app.include_router(create_handshake_router())

    client = TestClient(app)
    response = client.get("/.well-known/mythos-handshake")

    assert response.status_code == 200
    assert response.json()["ok"] is True
