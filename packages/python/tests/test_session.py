import os
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import pytest

from mythos_sdk import MythosConfigError, MythosSession, decode_session, encode_session

SESSION = MythosSession(
    userId="user-1",
    email="user@example.com",
    displayName="User",
    listingId="listing-abc",
    sessionJti="jti-001",
    llmIdentityToken="identity-token",
    llmIdentityExpiresAt=(datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
)


@pytest.fixture(autouse=True)
def session_secret():
    os.environ["MYTHOS_SESSION_SECRET"] = "test-secret-do-not-use-in-prod"
    yield
    os.environ.pop("MYTHOS_SESSION_SECRET", None)


def test_round_trips_a_session_through_encode_and_decode():
    token = encode_session(SESSION)
    assert decode_session(token) == SESSION


def test_returns_none_for_a_tampered_token():
    token = encode_session(SESSION)
    tampered = token[:-4] + ("BBBB" if token[-4:] != "BBBB" else "AAAA")
    assert decode_session(tampered) is None


def test_returns_none_when_decoded_with_the_wrong_secret():
    token = encode_session(SESSION)
    os.environ["MYTHOS_SESSION_SECRET"] = "a-completely-different-secret"
    assert decode_session(token) is None


def test_returns_none_for_malformed_input():
    assert decode_session("not-a-valid-token") is None


def test_returns_none_once_llm_identity_expires_at_has_passed():
    expired = replace(SESSION, llmIdentityExpiresAt=(datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat())
    token = encode_session(expired)
    assert decode_session(token) is None


def test_round_trips_a_session_with_no_expiry_at_all():
    without_expiry = replace(SESSION, llmIdentityExpiresAt=None)
    token = encode_session(without_expiry)
    assert decode_session(token) == without_expiry


def test_raises_mythos_config_error_when_secret_is_missing():
    os.environ.pop("MYTHOS_SESSION_SECRET", None)
    with pytest.raises(MythosConfigError):
        encode_session(SESSION)
