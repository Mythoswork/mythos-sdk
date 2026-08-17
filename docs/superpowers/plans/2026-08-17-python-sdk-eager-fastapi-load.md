# Python SDK Eager Fastapi Load Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `from mythos_sdk import verify_launch_token` (or any other
single name) from eagerly requiring `fastapi`, by deferring `fastapi`
imports in `handshake.py`, `listing_callback.py`, and `middleware.py` to the
point they're actually needed, and replacing `__init__.py`'s eager
re-exports of those three modules' names with lazy, on-access resolution.

**Architecture:** Three per-file changes (move each module's `fastapi`
import inside its factory function, so importing the module alone no longer
touches `fastapi`) plus one package-level change (`__init__.py` gets a PEP
562 `__getattr__` that lazily imports `handshake`/`listing_callback`/
`middleware` only when one of their exported names is actually accessed,
instead of unconditionally at package-import time). `handshake.py`'s
eager `handshake_router = create_handshake_router()` singleton is deleted;
`__init__.py`'s lazy resolution + caching (`globals()[name] = value`)
reproduces the same "ready instance on access" contract without building it
at import time. No exported name, signature, or `pyproject.toml` dependency
classification changes — ships as a patch release.

**Tech Stack:** Python 3.11+, pytest + pytest-asyncio, FastAPI (only for
the parts that already needed it), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-17-python-sdk-eager-fastapi-load-design.md`

## Global Constraints

- No exported name added, removed, or changed in type. `handshake_router` stays a ready `APIRouter` instance on access; `create_handshake_router`, `create_listing_callback_handler`, `require_launch_token` keep their exact current signatures.
- `__all__` in `packages/python/mythos_sdk/__init__.py` stays unchanged.
- No `pyproject.toml` dependency changes — `fastapi` stays under `[project.optional-dependencies]`.
- No doc changes needed — every documented `from mythos_sdk import ...` call site keeps working unmodified (see spec's Backward compatibility section for the full list).
- No `.github/workflows/ci.yml` changes — the existing `pip install -e ".[dev]"` then `pytest -q` sequence must keep working unmodified (the `dev` dependency group already includes `fastapi[standard]`, so CI always has it available).
- Verify everything with `cd packages/python && pytest -q`.
- `packages/node` is untouched — covered by the companion Node plan (`docs/superpowers/plans/2026-08-17-sdk-eager-handshake-version-load.md`).

---

### Task 1: Defer `fastapi` imports inside each factory function

**Files:**
- Modify: `packages/python/mythos_sdk/middleware.py:1-3`
- Modify: `packages/python/mythos_sdk/listing_callback.py:1-6`
- Modify: `packages/python/mythos_sdk/handshake.py:1-5`, `:54` (remove eager singleton)
- Test: `packages/python/tests/test_lazy_import.py`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `create_handshake_router() -> APIRouter` (unchanged signature, `fastapi` no longer imported at module scope), `create_listing_callback_handler(on_registered) -> Callable[[Request], Awaitable[JSONResponse]]` (unchanged), `require_launch_token(resolve_listing_ids=None) -> Callable[..., Awaitable[MythosSession]]` (unchanged). Task 2's `__init__.py` rewrite calls these three via `importlib.import_module`, so their module-level names (`create_handshake_router`, `create_listing_callback_handler`, `require_launch_token`) must still exist as real attributes of their respective modules after this task — only *how early* `fastapi` loads changes, not what's exported from each file.

- [ ] **Step 1: Write the failing test**

Create `packages/python/tests/test_lazy_import.py`:

```python
import sys

import pytest


def _purge_mythos_sdk_modules():
    for name in list(sys.modules):
        if name == "mythos_sdk" or name.startswith("mythos_sdk."):
            del sys.modules[name]


def test_import_without_fastapi_does_not_raise(monkeypatch):
    monkeypatch.setitem(sys.modules, "fastapi", None)
    _purge_mythos_sdk_modules()
    try:
        import importlib

        mythos_sdk = importlib.import_module("mythos_sdk")

        assert mythos_sdk.verify_launch_token is not None
        assert mythos_sdk.report_usage is not None
    finally:
        _purge_mythos_sdk_modules()


def test_accessing_handshake_router_without_fastapi_raises(monkeypatch):
    monkeypatch.setitem(sys.modules, "fastapi", None)
    _purge_mythos_sdk_modules()
    try:
        import importlib

        mythos_sdk = importlib.import_module("mythos_sdk")

        with pytest.raises(ImportError):
            _ = mythos_sdk.handshake_router
    finally:
        _purge_mythos_sdk_modules()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/python && pytest tests/test_lazy_import.py -v`

Expected: FAIL on `test_import_without_fastapi_does_not_raise` — `import
mythos_sdk` currently raises `ImportError` (or `ModuleNotFoundError`, its
subclass) immediately, because `__init__.py` eagerly imports `.handshake`,
which eagerly imports `fastapi`, which is poisoned to `None` in
`sys.modules` by the test. (The second test may error rather than cleanly
fail at this stage, since `mythos_sdk` itself won't have imported
successfully yet in a way that produces a `mythos_sdk` object to access
`.handshake_router` on — that's expected at this step; it gets meaningful
once Task 1 + Task 2 are both done.)

- [ ] **Step 3: Move `fastapi` import inside `require_launch_token`**

Current `packages/python/mythos_sdk/middleware.py:1-9`:

```python
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Query
from jose.exceptions import JOSEError

from .api_client import consume_session
from .errors import InvalidLaunchTokenError, MythosConfigError
from .types import MythosSession
from .verify import verify_launch_token

def require_launch_token(
    resolve_listing_ids: Callable[[], Awaitable[list[str]]] | None = None,
) -> Callable[..., Awaitable[MythosSession]]:
    async def dependency(lt: str = Query(..., alias="lt")) -> MythosSession:
```

Replace with:

```python
from collections.abc import Awaitable, Callable

from jose.exceptions import JOSEError

from .api_client import consume_session
from .errors import InvalidLaunchTokenError, MythosConfigError
from .types import MythosSession
from .verify import verify_launch_token

def require_launch_token(
    resolve_listing_ids: Callable[[], Awaitable[list[str]]] | None = None,
) -> Callable[..., Awaitable[MythosSession]]:
    from fastapi import HTTPException, Query

    async def dependency(lt: str = Query(..., alias="lt")) -> MythosSession:
```

(Rest of the file — `dependency`'s body — is unchanged; it already
references `HTTPException` by name, which now resolves via the enclosing
function's local scope instead of module scope, same value either way.)

- [ ] **Step 4: Move `fastapi` import inside `create_listing_callback_handler`**

Current `packages/python/mythos_sdk/listing_callback.py:1-8`:

```python
import logging
import os
from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JOSEError, JWTClaimsError, JWTError
```

Replace with:

```python
import logging
import os
from collections.abc import Awaitable, Callable

from jose import jwt
from jose.exceptions import ExpiredSignatureError, JOSEError, JWTClaimsError, JWTError
```

Current `packages/python/mythos_sdk/listing_callback.py:40-43`:

```python
def create_listing_callback_handler(
    on_registered: Callable[[str], Awaitable[None]],
) -> Callable[[Request], Awaitable[JSONResponse]]:
    async def mythos_listing_registered(request: Request) -> JSONResponse:
```

Replace with:

```python
def create_listing_callback_handler(
    on_registered: Callable[[str], Awaitable[None]],
) -> "Callable[[Request], Awaitable[JSONResponse]]":
    from fastapi import Request
    from fastapi.responses import JSONResponse

    async def mythos_listing_registered(request: Request) -> JSONResponse:
```

(The outer function's own return-type annotation is quoted as a string
literal since `Request`/`JSONResponse` aren't in module scope at
`def create_listing_callback_handler` evaluation time anymore — a forward
reference, standard Python; it's never evaluated at runtime unless
something calls `typing.get_type_hints()` on this function, which nothing
in this codebase does. The nested `mythos_listing_registered`'s own
annotations are fine unquoted since by the time Python evaluates *that*
`def`, the local `from fastapi import ...` lines above it have already run.)

- [ ] **Step 5: Move `fastapi` import inside `create_handshake_router`, delete the eager singleton**

Current `packages/python/mythos_sdk/handshake.py:1-10`:

```python
import logging
import os

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JOSEError, JWTError

from .jwks_cache import get_jwks, get_jwks_with_kid_fallback
from .version import SDK_VERSION
```

Replace with:

```python
import logging
import os

from jose import jwt
from jose.exceptions import ExpiredSignatureError, JOSEError, JWTError

from .jwks_cache import get_jwks, get_jwks_with_kid_fallback
from .version import SDK_VERSION
```

Current `packages/python/mythos_sdk/handshake.py:34-54`:

```python
def create_handshake_router() -> APIRouter:
    router = APIRouter()

    @router.get("/.well-known/mythos-handshake")
    async def mythos_handshake(request: Request) -> JSONResponse:
        token = request.query_params.get("lt")
        if not token:
            return JSONResponse({"error": "Missing launch token"}, status_code=401)
        try:
            await _validate_handshake_token(token)
        except JOSEError:
            return JSONResponse({"error": "Invalid launch token"}, status_code=401)
        except Exception:
            _logger.exception("Unexpected error in handshake endpoint")
            return JSONResponse({"error": "Service unavailable"}, status_code=503)
        return JSONResponse({"ok": True, "sdk_version": SDK_VERSION})

    return router


handshake_router = create_handshake_router()
```

Replace with:

```python
def create_handshake_router() -> "APIRouter":
    from fastapi import APIRouter, Request
    from fastapi.responses import JSONResponse

    router = APIRouter()

    @router.get("/.well-known/mythos-handshake")
    async def mythos_handshake(request: Request) -> JSONResponse:
        token = request.query_params.get("lt")
        if not token:
            return JSONResponse({"error": "Missing launch token"}, status_code=401)
        try:
            await _validate_handshake_token(token)
        except JOSEError:
            return JSONResponse({"error": "Invalid launch token"}, status_code=401)
        except Exception:
            _logger.exception("Unexpected error in handshake endpoint")
            return JSONResponse({"error": "Service unavailable"}, status_code=503)
        return JSONResponse({"ok": True, "sdk_version": SDK_VERSION})

    return router
```

(The trailing `handshake_router = create_handshake_router()` module-level
line is deleted entirely — Task 2 makes `__init__.py` responsible for
producing that value lazily, on first access, instead of `handshake.py`
building it unconditionally on its own import.)

- [ ] **Step 6: Run the new test again**

Run: `cd packages/python && pytest tests/test_lazy_import.py -v`

Expected: `test_import_without_fastapi_does_not_raise` still FAILS —
`__init__.py` hasn't been changed yet, so `import mythos_sdk` still eagerly
does `from .handshake import create_handshake_router, handshake_router`,
which still fails since `handshake.py` no longer defines a module-level
`handshake_router` at all after Step 5 (confirms Task 2 is required next,
not a redundant step).

- [ ] **Step 7: Commit**

```bash
git add packages/python/mythos_sdk/middleware.py \
  packages/python/mythos_sdk/listing_callback.py \
  packages/python/mythos_sdk/handshake.py \
  packages/python/tests/test_lazy_import.py
git commit -m "fix(sdk): defer fastapi imports to factory-call time in Python SDK"
```

---

### Task 2: Lazy package-level resolution in `__init__.py`

**Files:**
- Modify: `packages/python/mythos_sdk/__init__.py` (full rewrite of the import block)

**Interfaces:**
- Consumes: `create_handshake_router` from `.handshake` (Task 1, now `fastapi`-free at module scope), `create_listing_callback_handler` from `.listing_callback` (Task 1), `require_launch_token` from `.middleware` (Task 1) — all resolved via `importlib.import_module` inside `__getattr__`, not top-level `from .x import y`.
- Produces: `mythos_sdk.verify_launch_token`, `mythos_sdk.require_launch_token`, `mythos_sdk.report_usage`, `mythos_sdk.handshake_router`, `mythos_sdk.create_handshake_router`, `mythos_sdk.create_listing_callback_handler`, `mythos_sdk.MythosSession`, and the six error classes — same names, same `__all__`, as today. No other task depends on this one internally (it's the outermost layer).

- [ ] **Step 1: Replace `__init__.py`'s import block**

Current `packages/python/mythos_sdk/__init__.py` (full file):

```python
from .errors import (
    InsufficientFundsError,
    InvalidLaunchTokenError,
    InvalidUsageError,
    MythosConfigError,
    MythosError,
    SessionNotFoundError,
)
from .handshake import create_handshake_router, handshake_router
from .listing_callback import create_listing_callback_handler
from .middleware import require_launch_token
from .report_usage import report_usage
from .types import MythosSession
from .verify import verify_launch_token

__all__ = [
    "verify_launch_token",
    "require_launch_token",
    "report_usage",
    "handshake_router",
    "create_handshake_router",
    "create_listing_callback_handler",
    "MythosSession",
    "MythosError",
    "MythosConfigError",
    "InvalidLaunchTokenError",
    "InsufficientFundsError",
    "SessionNotFoundError",
    "InvalidUsageError",
]
```

Replace with:

```python
import importlib

from .errors import (
    InsufficientFundsError,
    InvalidLaunchTokenError,
    InvalidUsageError,
    MythosConfigError,
    MythosError,
    SessionNotFoundError,
)
from .report_usage import report_usage
from .types import MythosSession
from .verify import verify_launch_token

__all__ = [
    "verify_launch_token",
    "require_launch_token",
    "report_usage",
    "handshake_router",
    "create_handshake_router",
    "create_listing_callback_handler",
    "MythosSession",
    "MythosError",
    "MythosConfigError",
    "InvalidLaunchTokenError",
    "InsufficientFundsError",
    "SessionNotFoundError",
    "InvalidUsageError",
]

# fastapi-backed names: resolved lazily (PEP 562) so `import mythos_sdk` and
# `from mythos_sdk import verify_launch_token`/`report_usage` never require
# fastapi to be installed. Each entry maps the public name to the submodule
# and attribute that actually defines it.
_LAZY_ATTRS = {
    "handshake_router": ("handshake", "handshake_router"),
    "create_handshake_router": ("handshake", "create_handshake_router"),
    "create_listing_callback_handler": (
        "listing_callback",
        "create_listing_callback_handler",
    ),
    "require_launch_token": ("middleware", "require_launch_token"),
}


def __getattr__(name: str):
    target = _LAZY_ATTRS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attr_name = target
    module = importlib.import_module(f".{module_name}", __name__)
    if attr_name == "handshake_router" and not hasattr(module, "handshake_router"):
        # handshake.py no longer builds this eagerly — build it the first
        # time it's actually requested, then cache below like every other
        # lazy attribute.
        module.handshake_router = module.create_handshake_router()
    value = getattr(module, attr_name)
    globals()[name] = value  # cache on this package so repeat access skips __getattr__
    return value
```

- [ ] **Step 2: Run the lazy-import test**

Run: `cd packages/python && pytest tests/test_lazy_import.py -v`

Expected: PASS — both tests. `import mythos_sdk` with `fastapi` poisoned to
`None` succeeds and exposes `verify_launch_token`/`report_usage`; accessing
`mythos_sdk.handshake_router` under the same poisoned `sys.modules` raises
`ImportError` (from the `import fastapi` inside `create_handshake_router()`,
triggered by `__getattr__`'s `importlib.import_module(".handshake", ...)` →
`handshake.py` module body has no top-level `fastapi` import anymore per
Task 1, but `module.create_handshake_router()`'s call in the `__getattr__`
branch above does call into a function whose *first line* is `from fastapi
import APIRouter, Request` — that's what raises).

- [ ] **Step 3: Run the full existing suite to confirm no regression**

Run: `cd packages/python && pytest -q`

Expected: all existing tests pass, including `test_handshake.py`,
`test_middleware.py`, `test_listing_callback.py` — these all import via
`from mythos_sdk import create_handshake_router` / etc. (or via
`mythos_sdk.handshake_router` for the ones using the pre-built router) with
real `fastapi` present (declared in `[dependency-groups] dev`), proving the
lazy path resolves correctly and behaves identically for consumers who do
use these features.

- [ ] **Step 4: Manual check — repeated access doesn't re-trigger `__getattr__`**

Run: `cd packages/python && python -c "
import mythos_sdk
r1 = mythos_sdk.handshake_router
r2 = mythos_sdk.handshake_router
assert r1 is r2, 'handshake_router should be cached, not rebuilt per access'
print('ok: cached correctly')
"`

Expected: prints `ok: cached correctly` — confirms the
`globals()[name] = value` caching line works, so `handshake_router` is a
true singleton after first access (same guarantee the old eager
`handshake_router = create_handshake_router()` line gave, just built lazily
instead of unconditionally).

- [ ] **Step 5: Commit**

```bash
git add packages/python/mythos_sdk/__init__.py
git commit -m "fix(sdk): lazily resolve fastapi-backed exports in mythos_sdk/__init__.py"
```

---

## Final verification

- [ ] Run `cd packages/python && pytest -q` — full suite green.
- [ ] Run `cd packages/python && python -c "import sys; sys.modules['fastapi'] = None; import mythos_sdk; print(mythos_sdk.verify_launch_token, mythos_sdk.report_usage)"` — prints both callables without raising, confirming the fix works outside pytest's fixture machinery too.
- [ ] Confirm `packages/python/pyproject.toml`'s `version` field gets its normal patch bump as part of the release that ships this fix (not part of this plan's commits — follows this repo's existing release process).
