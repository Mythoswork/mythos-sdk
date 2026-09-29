import json
from pathlib import Path

import pytest

from mythos_sdk.session import _seal_session_with_nonce, open_session
from mythos_sdk.types import MythosSession


# The Node suite uses these same fixed vectors; backend refresh tests cannot prove cookie parity.
VECTORS = json.loads((Path(__file__).resolve().parents[3] / 'conformance' / 'session-v1.json').read_text())


@pytest.fixture(autouse=True)
def session_secret(monkeypatch):
    monkeypatch.setenv('MYTHOS_SESSION_SECRET', VECTORS['secret'])


@pytest.mark.parametrize('vector', VECTORS['valid'], ids=lambda vector: vector['name'])
def test_session_v1_valid(vector):
    payload = vector['payload']
    session = MythosSession(**{key: value for key, value in payload.items() if key != 'expiresAt'})
    assert _seal_session_with_nonce(session, payload['expiresAt'], bytes.fromhex(vector['iv_hex'])) == vector['token']
    assert open_session(vector['token']) == (session, payload['expiresAt'])


@pytest.mark.parametrize('vector', VECTORS['invalid'], ids=lambda vector: vector['name'])
def test_session_v1_invalid(vector):
    assert open_session(vector['token']) is None
