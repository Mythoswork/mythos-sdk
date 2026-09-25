import logging
import os

_log = logging.getLogger("mythos")


def log_error(msg: str, exc: BaseException | None = None) -> None:
    _log.error("[mythos] %s", msg, exc_info=exc)


def log_warn(msg: str) -> None:
    _log.warning("[mythos] %s", msg)


def log_debug(msg: str) -> None:
    if os.environ.get("MYTHOS_DEBUG") == "1":
        _log.debug("[mythos] %s", msg)
