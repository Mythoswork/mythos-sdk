import asyncio
from typing import cast
from urllib.parse import quote

import httpx
from jose import jwt

from .config import load_config
from .constants.diagnostics import (
    DIAGNOSTIC_MESSAGES, DIAGNOSTIC_TIMEOUT_SECONDS, DiagnosticCode, DiagnosticStep,
)
from .errors import MythosError
from .http import get_http_client
from .logger import log_debug
from .session import StoredSession
from .types import MythosSession
from .version import SDK_VERSION

_tasks: set[asyncio.Task[None]] = set()


def read_test_jti(token: str) -> str | None:
    try:
        payload = jwt.get_unverified_claims(token)
        jti = payload.get("jti")
        return jti if payload.get("test") is True and isinstance(jti, str) else None
    except Exception:
        return None


async def _send_diagnostic(jti: str, code: DiagnosticCode, step: DiagnosticStep) -> None:
    try:
        async with asyncio.timeout(DIAGNOSTIC_TIMEOUT_SECONDS):
            # Build independently of the shared client's cookie jar and default credentials.
            request = httpx.Request(
                "POST", f"{load_config().api_url}/api/apps/sessions/{quote(jti, safe='')}/diagnostics",
                json={"code": code, "step": step, "sdk_version": SDK_VERSION},
                extensions={"timeout": httpx.Timeout(DIAGNOSTIC_TIMEOUT_SECONDS).as_dict()},
            )
            await get_http_client().send(request, auth=None)
    except Exception:
        log_debug("diagnostics: report failed")


def report_diagnostic(jti: str, code: DiagnosticCode, step: DiagnosticStep) -> None:
    task = asyncio.create_task(_send_diagnostic(jti, code, step))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


def report_launch_failure(token: str, code: DiagnosticCode, step: DiagnosticStep) -> None:
    jti = read_test_jti(token)
    if jti is not None:
        report_diagnostic(jti, code, step)


def report_session_failure(session: MythosSession, error: MythosError, step: DiagnosticStep) -> None:
    if isinstance(session, StoredSession) and session.isTest is True and error.code in DIAGNOSTIC_MESSAGES:
        report_diagnostic(session.sessionJti, cast(DiagnosticCode, error.code), step)
