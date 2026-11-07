import json
from pathlib import Path

import pytest

from mythos_sdk.session import _seal_session_with_nonce, open_session
from mythos_sdk.types import MythosSession
from mythos_sdk.producer_key import hash_producer_key
from mythos_sdk import MythosError, usd_to_credits


# The Node suite uses these same fixed vectors; backend refresh tests cannot prove cookie parity.
VECTORS = json.loads((Path(__file__).resolve().parents[3] / 'conformance' / 'session-v1.json').read_text())
PRODUCER_VECTORS = json.loads((Path(__file__).resolve().parents[3] / 'conformance' / 'producer-key-v1.json').read_text())
USD_VECTORS = json.loads((Path(__file__).resolve().parents[3] / 'conformance' / 'usd-credits-v1.json').read_text())


@pytest.mark.parametrize('vector', USD_VECTORS['valid'])
def test_usd_valid(vector):
    assert usd_to_credits(vector['usd']) == vector['credits']


@pytest.mark.parametrize('usd', USD_VECTORS['invalid'] + ['1\n', '900719925474.0992', 0.15])
def test_usd_invalid(usd):
    with pytest.raises(MythosError) as error:
        usd_to_credits(usd)
    assert error.value.code == 'INVALID_CHARGE_AMOUNT'
    assert error.value.http_status == 400


def test_usd_maximum_safe_credits():
    assert usd_to_credits('900719925474.0991') == 9_007_199_254_740_991


@pytest.mark.parametrize('vector', PRODUCER_VECTORS['vectors'])
def test_producer_key_hash_vector(vector):
    assert hash_producer_key(vector['key']) == vector['pkh']


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
