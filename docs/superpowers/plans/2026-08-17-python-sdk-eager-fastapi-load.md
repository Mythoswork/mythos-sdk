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
- No `pyproject.toml` dependency changes — `fastapi` stays under `[project.optional-dependencies]` (`pyproject.toml:26-27`). Note `pyproject.toml:10`'s `fastapi[standard]` is a separate `[dependency-groups].dev` (PEP 735) entry for local/CI tooling — that's why the suite passes today despite the bug, and it must stay as-is so CI keeps exercising the real FastAPI paths.
- `packages/python/mythos_sdk/py.typed` ships, so the package advertises inline types. Any lazy-attribute mechanism must keep the lazy names visible to mypy/pyright via a `TYPE_CHECKING` block, or typed consumers break.
- Tests that simulate a missing `fastapi` must do so in a subprocess. Never purge `mythos_sdk*` from `sys.modules` inside the pytest session — the re-import creates duplicate module objects and silently breaks the existing suite's string-based `patch("mythos_sdk.handshake.get_jwks", ...)` mocks in a test-order-dependent way.
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
import subprocess
import sys
import textwrap


def _run_without_fastapi(body: str) -> subprocess.CompletedProcess:
    """Run `body` in a fresh interpreter where `import fastapi` fails.

    Deliberately a subprocess rather than mutating sys.modules in-process.
    Forcing a fresh `import mythos_sdk` here would require purging the cached
    `mythos_sdk*` entries, and the re-import creates a *second* set of
    submodule objects. tests/test_handshake.py patches by string
    (`patch("mythos_sdk.handshake.get_jwks", ...)`), which resolves the module
    fresh at patch time, while its module-level
    `from mythos_sdk import create_handshake_router` closes over the original
    module's globals. The patch would land on one object and the code under
    test would read the other, silently disabling those mocks in a
    test-order-dependent way. A subprocess touches nothing in this interpreter.
    """
    code = 'import sys\nsys.modules["fastapi"] = None\n' + textwrap.dedent(body)
    return subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)


def test_import_without_fastapi_does_not_raise():
    result = _run_without_fastapi(
        """
        import mythos_sdk

        assert callable(mythos_sdk.verify_launch_token)
        assert callable(mythos_sdk.report_usage)
        print("OK")
        """
    )

    assert result.returncode == 0, result.stderr
    assert "OK" in result.stdout


def test_accessing_handshake_router_without_fastapi_raises():
    result = _run_without_fastapi(
        """
        import mythos_sdk

        try:
            mythos_sdk.handshake_router
        except ImportError:
            print("OK")
        else:
            raise AssertionError("expected ImportError, got a router")
        """
    )

    assert result.returncode == 0, result.stderr
    assert "OK" in result.stdout
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/python && pytest tests/test_lazy_import.py -v`

Expected: FAIL on `test_import_without_fastapi_does_not_raise` — the
subprocess exits non-zero, and `result.stderr` shows the real traceback,
verified against the current code as:

```text
  File ".../mythos_sdk/__init__.py", line 9, in <module>
    from .handshake import create_handshake_router, handshake_router
  File ".../mythos_sdk/handshake.py", line 4, in <module>
    from fastapi import APIRouter, Request
ModuleNotFoundError: import of fastapi halted; None in sys.modules
```

That traceback is the bug stated exactly: `__init__.py:9` → `handshake.py:4`.

`test_accessing_handshake_router_without_fastapi_raises` also fails at this
stage, but for the wrong reason: its `import mythos_sdk` dies before reaching
the attribute access, so the `ImportError` comes from the eager barrel rather
than from the intended lazy path. It only becomes a meaningful assertion once
Task 2 lands.

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
from typing import TYPE_CHECKING

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

if TYPE_CHECKING:
    # False at runtime, so this imports nothing and never pulls in fastapi. It
    # exists so the lazily-resolved names stay visible to mypy/pyright: the
    # package ships mythos_sdk/py.typed, so without this block every consumer
    # type-checking `from mythos_sdk import require_launch_token` would get an
    # attr-defined error.
    from fastapi import APIRouter

    from .handshake import create_handshake_router as create_handshake_router
    from .listing_callback import (
        create_listing_callback_handler as create_listing_callback_handler,
    )
    from .middleware import require_launch_token as require_launch_token

    # Declared rather than imported: handshake.py deliberately no longer
    # defines a module-level `handshake_router`, so importing it would fail.
    handshake_router: APIRouter

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
# and attribute that actually defines it. `handshake_router` is absent on
# purpose — it has no defining attribute anymore and is special-cased below.
_LAZY_ATTRS = {
    "create_handshake_router": ("handshake", "create_handshake_router"),
    "create_listing_callback_handler": (
        "listing_callback",
        "create_listing_callback_handler",
    ),
    "require_launch_token": ("middleware", "require_launch_token"),
}


def __getattr__(name: str):
    if name == "handshake_router":
        # handshake.py deliberately no longer builds this at import time — that
        # eager construction is the bug. Build it on first access instead; the
        # cache below keeps it the same singleton object the old module-level
        # assignment produced.
        from .handshake import create_handshake_router

        value = create_handshake_router()
    else:
        target = _LAZY_ATTRS.get(name)
        if target is None:
            raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
        module_name, attr_name = target
        value = getattr(importlib.import_module(f".{module_name}", __name__), attr_name)

    globals()[name] = value  # cache, so repeat access skips __getattr__ entirely
    return value


def __dir__() -> list[str]:
    # Without this, dir(mythos_sdk) omits the lazy names until they're accessed.
    return sorted(__all__)
```

- [ ] **Step 2: Run the lazy-import test**

Run: `cd packages/python && pytest tests/test_lazy_import.py -v`

Expected: PASS — both tests. `import mythos_sdk` with `fastapi` poisoned to
`None` now succeeds and exposes `verify_launch_token`/`report_usage`.
Accessing `mythos_sdk.handshake_router` under the same conditions raises
`ImportError`, and it's worth being precise about where from: `__getattr__`'s
`from .handshake import create_handshake_router` succeeds (Task 1 removed
`handshake.py`'s top-level `fastapi` import), and the raise comes from the
subsequent `create_handshake_router()` call, whose first body line is
`from fastapi import APIRouter, Request`.

- [ ] **Step 2b: Confirm static typing still resolves**

Run: `cd packages/python && python -c "
import mythos_sdk
assert 'require_launch_token' in dir(mythos_sdk)
assert 'handshake_router' in dir(mythos_sdk)
print('ok: dir() complete')
"`

Expected: prints `ok: dir() complete` — confirms `__dir__` exposes the lazy
names before they're accessed.

If the repo has a type checker available (`mypy`/`pyright` are not currently
in `[dependency-groups] dev`, so this may be a no-op), also confirm a
consumer-style `from mythos_sdk import require_launch_token, handshake_router`
type-checks. The `TYPE_CHECKING` block exists specifically for this —
`mythos_sdk/py.typed` ships, so the package advertises inline types and a
bare `__getattr__` would silently break typed consumers.

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
- [ ] Run `cd packages/python && python -c "import sys; sys.modules['fastapi'] = None; import mythos_sdk; print(mythos_sdk.verify_launch_token, mythos_sdk.report_usage)"` — prints both callables without raising, confirming the fix works outside pytest's fixture machinery too. Before the fix this same command fails with `ModuleNotFoundError: import of fastapi halted; None in sys.modules` at `__init__.py:9` → `handshake.py:4`.
- [ ] Run `cd packages/python && grep -n "^from fastapi\|^import fastapi\|^from fastapi.responses" mythos_sdk/*.py` — must return nothing. Any module-level fastapi import left behind reintroduces the bug.
- [ ] Run `cd packages/python && python -c "import mythos_sdk; assert mythos_sdk.handshake_router is mythos_sdk.handshake_router; print('singleton ok')"` — confirms the caching keeps `handshake_router` a single object.
- [ ] Run `cd packages/python && pytest -q -p no:randomly` twice in a row (and, if the suite has any ordering plugin, in a shuffled order) to confirm `test_lazy_import.py` has no cross-test side effects on the string-based mocks in `test_handshake.py`.
- [ ] Confirm `packages/python/pyproject.toml`'s `version` field (currently `0.0.7`) gets its normal patch bump as part of the release that ships this fix — not part of this plan's commits, per this repo's existing release process.
