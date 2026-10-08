import base64
import hashlib
import os
from collections.abc import Mapping

from .constants.producer_key import (
    MALFORMED_PRODUCER_KEY_MESSAGE,
    MISSING_PRODUCER_KEY_WARNING,
    PRODUCER_KEY_PATTERN,
)
from .errors import MythosConfigError, ProducerMismatchError
from .logger import log_warn

_has_warned_missing_producer_key = False


def hash_producer_key(key: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(key.encode("utf-8")).digest()).rstrip(b"=").decode()


def read_producer_key() -> str | None:
    return os.environ.get("MYTHOS_KEY", "").strip() or None


def assert_producer_key_format() -> None:
    key = read_producer_key()
    if key and not PRODUCER_KEY_PATTERN.fullmatch(key):
        raise MythosConfigError(MALFORMED_PRODUCER_KEY_MESSAGE)


def warn_missing_producer_key_once() -> None:
    global _has_warned_missing_producer_key
    if _has_warned_missing_producer_key:
        return
    _has_warned_missing_producer_key = True
    log_warn(MISSING_PRODUCER_KEY_WARNING)


def assert_producer_binding(payload: Mapping[str, object]) -> None:
    key = read_producer_key()
    if not key or payload.get("pkh") == hash_producer_key(key):
        return
    error = ProducerMismatchError()
    listing_id = payload.get("listingId")
    error.listing_id = listing_id if isinstance(listing_id, str) else None
    raise error
