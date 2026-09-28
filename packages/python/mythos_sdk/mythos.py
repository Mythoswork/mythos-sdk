import os
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import asdict, replace
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol
from urllib.parse import urlsplit

import httpx
from jose import jwt
from jose.exceptions import JOSEError

from .api_client import (
    MeterResult, consume_session, meter_session, read_identity_fields,
    read_session_expires_at, refresh_session,
)
from .billing_metadata import MythosLlmBillingMetadata, get_llm_billing_metadata
from .config import load_config
from .errors import (
    InvalidLaunchTokenError,
    LaunchTokenConsumedError,
    MythosConfigError,
    MythosError,
    MythosUpstreamError,
    SessionExpiredError,
    SessionNotFoundError,
    SessionRequiredError,
)
from .logger import log_debug, log_error, log_warn
from .session import open_session, seal_session
from .types import MythosSession
from .version import SDK_VERSION
from .verify import verify_launch_token

SESSION_COOKIE = "mythos_session"
SESSION_HEADER = "x-mythos-session"
DEFAULT_SESSION_TTL_SECONDS = 1800
REFRESH_LEAD_SECONDS = 300
MIN_SESSION_SECRET_LENGTH = 32


class RequestLike(Protocol):
    headers: Mapping[str, str]
    cookies: Mapping[str, str]


class _SessionRequestLike(RequestLike, Protocol):
    url: Any
    query_params: Mapping[str, str]


class Mythos:
    def __init__(
        self,
        resolve_listing_ids: Callable[[], Awaitable[list[str]]] | None = None,
        on_listing_registered: Callable[[str], Awaitable[None]] | None = None,
    ) -> None:
        self._resolve_listing_ids = resolve_listing_ids
        self._on_listing_registered = on_listing_registered

    def _read_stored_session(self, request: RequestLike) -> tuple[MythosSession, str] | None:
        cookie_token = request.cookies.get(SESSION_COOKIE)
        if cookie_token:
            session = open_session(cookie_token)
            if session is not None:
                return session
        header_token = request.headers.get(SESSION_HEADER)
        return open_session(header_token) if header_token else None

    @staticmethod
    def _public_session(session: MythosSession) -> MythosSession:
        return replace(session, llmIdentityToken=None, llmIdentityExpiresAt=None)

    async def get_session(self, request: RequestLike) -> MythosSession | None:
        stored = self._read_stored_session(request)
        return self._public_session(stored[0]) if stored else None

    async def charge(
        self,
        request: RequestLike,
        *,
        credits: int,
        reason: str | None = None,
        idempotency_key: str | None = None,
        consent_id: str | None = None,
    ) -> MeterResult:
        stored = self._read_stored_session(request)
        if stored is None:
            raise SessionRequiredError()
        session, _expires_at = stored
        if consent_id:
            log_debug("charge: consentId accepted (enforcement deferred to Phase 4)")
        try:
            return await meter_session(session.sessionJti, credits, reason, idempotency_key)
        except MythosError as err:
            if err.http_status >= 500:
                log_error(f"charge failed: {err.code}; jti={session.sessionJti}")
            raise

    async def llm(
        self,
        request: RequestLike,
        *,
        api_key: str | None = None,
        fallback: Any = None,
        base_url: str | None = None,
        timeout: float = 600.0,
    ) -> Any:
        from .llm import llm as build_llm

        stored = self._read_stored_session(request)
        session = stored[0] if stored else None
        if session is not None and not session.llmIdentityToken:
            log_warn("llm: session has no LLM identity token (backend identity key misconfigured?)")
        if stored and session and session.llmIdentityToken:
            outcome, session, _expires_at, error = await self._refresh_if_due(*stored)
            if outcome == "expired":
                raise error or SessionExpiredError()
        return build_llm(session, api_key=api_key, fallback=fallback, base_url=base_url, timeout=timeout)

    async def _refresh_if_due(
        self, session: MythosSession, expires_at: str, force: bool = False,
    ) -> tuple[str, MythosSession, str, SessionExpiredError | None]:
        if not session.llmIdentityToken or not session.llmIdentityExpiresAt:
            return "unchanged", session, expires_at, None
        try:
            due_at = datetime.fromisoformat(session.llmIdentityExpiresAt.replace("Z", "+00:00"))
            if due_at.tzinfo is None:
                due_at = due_at.replace(tzinfo=timezone.utc)
        except ValueError:
            due_at = datetime.now(timezone.utc)
        if not force and datetime.now(timezone.utc) < due_at - timedelta(seconds=REFRESH_LEAD_SECONDS):
            return "unchanged", session, expires_at, None
        try:
            refreshed = await refresh_session(session.sessionJti, session.llmIdentityToken)
        except (SessionExpiredError, SessionNotFoundError):
            return "expired", session, expires_at, SessionExpiredError("Mythos session expired — relaunch from Mythos")
        except Exception as err:
            code = err.code if isinstance(err, MythosError) else "REFRESH_FAILED"
            log_warn(f"session: identity refresh failed; keeping current session; code={code}; jti={session.sessionJti}")
            return "unchanged", session, expires_at, None
        if refreshed is None:
            log_debug("session: backend has no refresh endpoint")
            return "unchanged", session, expires_at, None
        return "refreshed", replace(
            session,
            llmIdentityToken=refreshed.llm_identity_token,
            llmIdentityExpiresAt=refreshed.llm_identity_expires_at,
        ), refreshed.session_expires_at, None

    async def _existing_session_response(
        self, session: MythosSession, expires_at: str,
    ) -> tuple[int, dict[str, Any], str | None, str | None]:
        outcome, active, active_expiry, error = await self._refresh_if_due(session, expires_at)
        if outcome == "expired":
            expired = error or SessionExpiredError()
            return expired.http_status, {"success": False, "error": str(expired), "code": expired.code}, None, None
        status, body, _, _ = self._session_success(active, active_expiry)
        return status, body, body["data"]["sessionToken"] if outcome == "refreshed" else None, active_expiry

    def _session_success(
        self, session: MythosSession, expires_at: str,
    ) -> tuple[int, dict[str, Any], str, str]:
        session_token = seal_session(session, expires_at)
        refresh_at = None
        if session.llmIdentityToken and session.llmIdentityExpiresAt:
            try:
                identity_expiry = datetime.fromisoformat(session.llmIdentityExpiresAt.replace("Z", "+00:00"))
                if identity_expiry.tzinfo is None:
                    identity_expiry = identity_expiry.replace(tzinfo=timezone.utc)
                refresh_at = (identity_expiry - timedelta(seconds=REFRESH_LEAD_SECONDS)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            except ValueError:
                pass
        return 200, {
            "success": True,
            "data": {
                "session": asdict(self._public_session(session)),
                "sessionToken": session_token,
                "expiresAt": expires_at,
                "refreshAt": refresh_at,
            },
        }, session_token, expires_at

    def billing(self, completion: object) -> MythosLlmBillingMetadata | None:
        return get_llm_billing_metadata(completion)

    async def handle_session(
        self,
        request: _SessionRequestLike,
    ) -> tuple[int, dict[str, Any], str | None, str | None]:
        launch_token = request.query_params.get("lt")
        existing = self._read_stored_session(request)

        if not launch_token:
            if existing:
                return await self._existing_session_response(*existing)
            return 200, {"success": True, "data": None}, None, None

        try:
            incoming = await verify_launch_token(launch_token, self._resolve_listing_ids)
        except Exception as err:
            if existing and self._unverified_jti(launch_token) == existing[0].sessionJti:
                return await self._existing_session_response(*existing)
            if isinstance(err, MythosConfigError):
                log_error("session: invalid SDK configuration", err)
                return 500, {"success": False, "error": str(err), "code": "CONFIG_ERROR"}, None, None
            if isinstance(err, (InvalidLaunchTokenError, JOSEError)):
                return 401, {"success": False, "error": "Invalid launch token", "code": "INVALID_LAUNCH_TOKEN"}, None, None
            log_error("session: could not verify launch token (JWKS/network)", err)
            return 503, {
                "success": False,
                "error": "Could not reach Mythos to verify the launch",
                "code": "MYTHOS_UNREACHABLE",
            }, None, None

        if existing and existing[0].sessionJti == incoming.sessionJti:
            return await self._existing_session_response(*existing)

        try:
            consume_response = await consume_session(incoming.sessionJti)
        except Exception as err:
            log_error("session: consume request failed", err)
            return 503, {
                "success": False,
                "error": "Could not reach Mythos to consume the session",
                "code": "MYTHOS_UNREACHABLE",
            }, None, None
        if consume_response.status_code == 409:
            error = LaunchTokenConsumedError()
            return error.http_status, {"success": False, "error": str(error), "code": error.code}, None, None
        if not (200 <= consume_response.status_code < 300):
            code = self._response_code(consume_response)
            log_error(f"session: consume returned {consume_response.status_code}; code={code}; jti={incoming.sessionJti}")
            if code == "SESSION_EXPIRED":
                error = SessionExpiredError("Launch expired — relaunch from Mythos")
                return error.http_status, {"success": False, "error": str(error), "code": error.code}, None, None
            error = MythosUpstreamError("Mythos consume failed", consume_response.status_code, code)
            return error.http_status, {"success": False, "error": str(error), "code": error.code}, None, None

        try:
            consume_body = consume_response.json()
        except (ValueError, TypeError):
            consume_body = None
        identity = read_identity_fields(consume_body)
        if identity is None:
            log_warn("session: consume returned no LLM identity token; mythos.llm() will use fallback or throw")
            session = incoming
        else:
            identity_token, identity_expiry = identity
            session = replace(
                incoming,
                llmIdentityToken=identity_token,
                llmIdentityExpiresAt=identity_expiry,
            )
        expires_at = read_session_expires_at(consume_body) or session.llmIdentityExpiresAt or (
            datetime.now(timezone.utc) + timedelta(seconds=DEFAULT_SESSION_TTL_SECONDS)
        ).isoformat()
        return self._session_success(session, expires_at)

    @staticmethod
    def _unverified_jti(token: str) -> str | None:
        try:
            jti = jwt.get_unverified_claims(token).get("jti")
            return jti if isinstance(jti, str) else None
        except Exception:
            return None

    @staticmethod
    def _response_code(response: httpx.Response) -> str | None:
        try:
            body = response.json()
            code = body.get("code") if isinstance(body, dict) else None
            return code if isinstance(code, str) else None
        except (ValueError, TypeError):
            return None

    @property
    def router(self) -> Any:
        from fastapi import APIRouter, Request
        from fastapi.responses import JSONResponse

        from .handshake import _validate_handshake_token
        from .listing_callback import _validate_listing_callback_token

        router = APIRouter()

        @router.get("/api/mythos/session")
        async def session_route(request: Request) -> JSONResponse:
            try:
                status, body, session_token, expires_at = await self.handle_session(request)
                response = JSONResponse(body, status_code=status)
                if session_token and expires_at:
                    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
                    is_https = request.url.scheme == "https" or forwarded_proto == "https"
                    expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                    if expiry.tzinfo is None:
                        expiry = expiry.replace(tzinfo=timezone.utc)
                    max_age = max(0, int((expiry - datetime.now(timezone.utc)).total_seconds()))
                    response.set_cookie(
                        SESSION_COOKIE,
                        session_token,
                        max_age=max_age,
                        path="/",
                        httponly=True,
                        samesite="none" if is_https else "lax",
                        secure=is_https,
                        partitioned=False,
                    )
                    if is_https:
                        response.headers["set-cookie"] = response.headers["set-cookie"] + "; Partitioned"
                elif status == 401 and body.get("code") == "SESSION_EXPIRED":
                    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
                    is_https = request.url.scheme == "https" or forwarded_proto == "https"
                    response.delete_cookie(
                        SESSION_COOKIE,
                        path="/",
                        secure=is_https,
                        httponly=True,
                        samesite="none" if is_https else "lax",
                    )
                    if is_https:
                        response.headers["set-cookie"] += "; Partitioned"
                return response
            except MythosError as err:
                if err.http_status >= 500:
                    log_error(f"session: failed with {err.code}", err)
                return JSONResponse(
                    {"success": False, "error": str(err), "code": err.code},
                    status_code=err.http_status,
                )
            except Exception as err:
                log_error("session: unexpected error", err)
                return JSONResponse(
                    {"success": False, "error": "Internal server error", "code": "INTERNAL_ERROR"},
                    status_code=500,
                )

        @router.get("/.well-known/mythos-handshake")
        async def handshake_route(request: Request) -> JSONResponse:
            token = request.query_params.get("lt")
            if not token:
                return JSONResponse({"error": "Missing launch token"}, status_code=401)
            try:
                await _validate_handshake_token(token)
            except JOSEError:
                return JSONResponse({"error": "Invalid launch token"}, status_code=401)
            except Exception as err:
                log_error("handshake: unexpected error", err)
                return JSONResponse({"error": "Service unavailable"}, status_code=503)
            return JSONResponse({"ok": True, "sdk_version": SDK_VERSION})

        if self._on_listing_registered is not None:
            async def listing_registered(request: Request) -> JSONResponse:
                token = request.query_params.get("lt")
                if not token:
                    return JSONResponse({"error": "Missing listing callback token"}, status_code=401)
                try:
                    listing_id = await _validate_listing_callback_token(token)
                    await self._on_listing_registered(listing_id)
                except JOSEError:
                    return JSONResponse({"error": "Invalid listing callback token"}, status_code=401)
                except Exception as err:
                    log_error("listing-callback: unexpected error", err)
                    return JSONResponse({"error": "Service unavailable"}, status_code=503)
                return JSONResponse({"ok": True})

            router.add_api_route("/.well-known/mythos-listing-registered", listing_registered, methods=["GET", "POST"])
        return router


def create_mythos(
    resolve_listing_ids: Callable[[], Awaitable[list[str]]] | None = None,
    on_listing_registered: Callable[[str], Awaitable[None]] | None = None,
) -> Mythos:
    secret = os.environ.get("MYTHOS_SESSION_SECRET")
    if not secret:
        raise MythosConfigError("MYTHOS_SESSION_SECRET is not set. Generate one with: openssl rand -base64 32")
    if len(secret) < MIN_SESSION_SECRET_LENGTH:
        raise MythosConfigError(f"MYTHOS_SESSION_SECRET must be at least 32 characters (got {len(secret)})")
    configured_api_url = os.environ.get("MYTHOS_API_URL")
    if configured_api_url is not None:
        parsed = urlsplit(configured_api_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise MythosConfigError("MYTHOS_API_URL is not a valid http(s) URL")
        try:
            parsed.port
        except ValueError as err:
            raise MythosConfigError("MYTHOS_API_URL is not a valid http(s) URL") from err
    config = load_config()
    if not config.listing_ids and resolve_listing_ids is None:
        raise MythosConfigError("MYTHOS_LISTING_ID (or MYTHOS_LISTING_IDS) is not set")
    log_debug(f"create_mythos: config ok; api_url={config.api_url}; listing_ids={config.listing_ids}")
    return Mythos(resolve_listing_ids, on_listing_registered)
