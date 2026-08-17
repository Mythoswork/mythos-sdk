# Lazy-load fastapi in the Python SDK's __init__

Jira: none filed yet for this half — discovered as a parity check while
scoping the Node ticket ("Mythos SDK versioning": eager `handshakeRoute`
re-export forces `express` onto every consumer). Same architecture bug
confirmed present in `packages/python/mythos_sdk`, independently, during
that investigation. Companion to
`docs/superpowers/specs/2026-08-17-sdk-eager-handshake-version-load-design.md`
(Node fix) — filed as its own spec/plan/PR per package, not bundled.

## Problem

`packages/python/mythos_sdk/__init__.py` unconditionally imports from every
submodule at package-load time:

```python
from .errors import (...)
from .handshake import create_handshake_router, handshake_router
from .listing_callback import create_listing_callback_handler
from .middleware import require_launch_token
from .report_usage import report_usage
from .types import MythosSession
from .verify import verify_launch_token
```

Python's `import` statement is eager and synchronous, same as Node's
CommonJS `require` — there is no built-in laziness for `from .x import y`.
`import mythos_sdk` (or `from mythos_sdk import verify_launch_token`)
therefore executes the full top-level body of every one of those seven
submodules, not just the one the caller wants.

Three of those seven hard-import `fastapi` at module top level:

- `middleware.py:3` — `from fastapi import HTTPException, Query`
- `listing_callback.py:5-6` — `from fastapi import Request` /
  `from fastapi.responses import JSONResponse`
- `handshake.py:4-5` — `from fastapi import APIRouter, Request` /
  `from fastapi.responses import JSONResponse`

`fastapi` is declared under `[project.optional-dependencies]`
(`pyproject.toml:26-27`, `fastapi = ["fastapi>=0.100.0"]`), not in the base
`[project] dependencies` list (`pyproject.toml:21-24`, which is only
`python-jose[cryptography]` and `httpx`). The package's own metadata says
"fastapi is optional, install the `fastapi` extra if you need it" — but the
eager `__init__.py` import makes it mandatory in practice for every
consumer, including ones who only want `verify_launch_token` (`verify.py` —
zero `fastapi` import, only `jose`, `config`, `errors`, `jwks_cache`,
`types`) or `report_usage` (`report_usage.py` — zero `fastapi` import, only
`api_client`). A consumer who runs `pip install mythos-sdk` (no `[fastapi]`
extra) and never touches FastAPI gets `ModuleNotFoundError: No module named
'fastapi'` on `import mythos_sdk`, from code they never call. This mirrors
the Node bug's failure mode exactly, and touches a larger fraction of the
public API surface — 3 of 7 submodules vs. Node's 1 of 5.

`handshake.py` has an extra wrinkle beyond the top-level imports:

```python
def create_handshake_router() -> APIRouter:
    ...

handshake_router = create_handshake_router()  # line 54 — runs at import time
```

`handshake_router` is a pre-built `APIRouter` **instance**, constructed
eagerly as a side effect of importing `handshake.py` at all — not merely a
factory function definition. This is documented, widely-used public API
(`docs-site/docs/getting-started/quickstart-python.md`,
`docs-site/docs/guides/fastapi.md`,
`docs-site/docs/reference/python/handshake-router.md`, etc. all show
`from mythos_sdk import handshake_router` used directly, no factory call).
Any fix must keep `handshake_router` behaving as a ready `APIRouter`
instance on access — it can't become a function without breaking every
documented call site.

Version sourcing (`version.py`) is **not** part of this bug: it calls
`importlib.metadata.version("mythos-sdk")` with a try/except fallback — a
standard packaging-metadata lookup, not a relative-path filesystem read like
Node's `createRequire(__filename)`. No equivalent of the Node ticket's
"`dist/version.js` reads its own `package.json`" failure exists on the
Python side. This spec is scoped to the eager-`fastapi`-import problem only.

## Scope

- `packages/python/mythos_sdk/__init__.py` — replace the eager
  `fastapi`-touching imports with lazy, on-first-access resolution.
- `packages/python/mythos_sdk/handshake.py` — move the `fastapi` imports
  inside `create_handshake_router()`; keep `handshake_router`'s public
  contract (a ready `APIRouter` instance on access) via the same
  lazy-`__init__.py` mechanism, not an eager module-level call.
- `packages/python/mythos_sdk/listing_callback.py` — move the `fastapi`
  imports inside `create_listing_callback_handler()`.
- `packages/python/mythos_sdk/middleware.py` — move the `fastapi` imports
  inside `require_launch_token()`.
- New regression tests proving `verify_launch_token`/`report_usage` import
  cleanly with `fastapi` unavailable, and that the three fastapi-backed
  names still work — lazily — when accessed.

Out of scope: `packages/node` (covered by the companion Node spec/plan/PR).
`version.py` (not broken — see above). Changing `fastapi` from an optional
extra to a hard dependency (rejected — it's already correctly modeled as
optional in `pyproject.toml`; the bug is the `__init__.py` import ignoring
that, not the dependency declaration itself).

## Design

### Per-submodule: move `fastapi` imports inside the factory function

`middleware.py`, current top:

```python
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Query
from jose.exceptions import JOSEError
```

Becomes:

```python
from collections.abc import Awaitable, Callable

from jose.exceptions import JOSEError
```

with `from fastapi import HTTPException, Query` moved to the first line
inside `require_launch_token()`'s body, before the nested `dependency`
function is defined (its default-value expression `Query(..., alias="lt")`
is evaluated when `dependency` is defined, i.e. when `require_launch_token()`
runs — so the import must land before that `def`, not merely anywhere in
the outer function).

Same pattern for `listing_callback.py`'s `from fastapi import Request` /
`from fastapi.responses import JSONResponse` → moved inside
`create_listing_callback_handler()`, before the nested
`mythos_listing_registered` function.

Same pattern for `handshake.py`'s `from fastapi import APIRouter, Request` /
`from fastapi.responses import JSONResponse` → moved inside
`create_handshake_router()`, before the nested `mythos_handshake` function.

None of these three factory functions' signatures or behavior change for
callers who do call them — `fastapi` was always going to be imported the
moment any of them runs; the only change is *when*, not *whether*.

### `handshake.py`'s eager singleton → lazy via `__init__.py`

Delete `handshake.py:54`'s eager `handshake_router = create_handshake_router()`.
`handshake.py` no longer builds an instance at import time at all — importing
`handshake.py` on its own only defines `create_handshake_router`, doing
nothing with `fastapi` until that function is called.

`__init__.py` stops eagerly importing all seven submodules and instead
defines a package-level `__getattr__` (PEP 562 — lazy module attributes,
standard library since Python 3.7) that resolves fastapi-backed names only
when actually accessed:

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
    # False at runtime, so this costs nothing and never imports fastapi — but it
    # makes the lazily-resolved names visible to mypy/pyright. The package ships
    # a py.typed marker, so without this block every consumer type-checking
    # `from mythos_sdk import require_launch_token` would get an attr-defined
    # error.
    from fastapi import APIRouter

    from .listing_callback import (
        create_listing_callback_handler as create_listing_callback_handler,
    )
    from .middleware import require_launch_token as require_launch_token

    # Declared, not imported: handshake.py deliberately no longer defines a
    # module-level `handshake_router`, so importing the name would be an error.
    handshake_router: APIRouter

    from .handshake import create_handshake_router as create_handshake_router

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

`errors`, `report_usage`, `types`, `verify` stay eager imports (zero
`fastapi` dependency, cheap, no reason to defer — matches this spec's
principle of only deferring what's actually expensive/optional). `__all__`
is unchanged, so `from mythos_sdk import *` and every documented
`from mythos_sdk import handshake_router` /
`from mythos_sdk import create_handshake_router` / etc. call site keeps
working exactly as before — the only observable difference is *when*
`fastapi` gets imported: on first access to one of the four lazy names,
instead of on `import mythos_sdk`.

Three details that make this a drop-in rather than a behavior change:

- **`globals()[name] = value`** means `__getattr__` fires only once per
  process per name — subsequent access hits the now-real module global
  directly (the standard PEP 562 caching idiom), so there's no repeated
  `importlib.import_module` overhead on hot paths, and `handshake_router`
  stays a true singleton (`mythos_sdk.handshake_router is
  mythos_sdk.handshake_router` holds, exactly as with the old eager
  assignment).
- **The `TYPE_CHECKING` block** preserves static-analysis behavior. This is
  not optional polish: `packages/python/mythos_sdk/py.typed` exists, so the
  package advertises inline types, and a bare `__getattr__` would make every
  lazy name invisible to mypy/pyright and break type-checking consumers.
- **`__dir__`** keeps `dir(mythos_sdk)` and REPL autocomplete complete,
  which `__getattr__` alone does not.

## Backward compatibility

- No exported name added, removed, or changes type. `handshake_router` is
  still a ready `APIRouter` instance wherever it's accessed;
  `create_handshake_router` / `create_listing_callback_handler` /
  `require_launch_token` are still the same callables with the same
  signatures.
- `__all__` unchanged.
- Static typing unchanged for consumers: the package ships
  `mythos_sdk/py.typed`, and the `TYPE_CHECKING` block keeps all four lazy
  names visible to mypy/pyright with their real types.
- `dir(mythos_sdk)` unchanged, via `__dir__`.
- `mythos_sdk.handshake_router is mythos_sdk.handshake_router` still holds —
  it remains a per-process singleton, just built on first access rather than
  at import.
- Every documented usage in `docs-site/docs/getting-started/quickstart-python.md`,
  `docs-site/docs/guides/fastapi.md`,
  `docs-site/docs/reference/python/handshake-router.md`, and
  `docs-site/docs/resources/mock-integration-apps.md` keeps working
  unmodified — none of them need doc changes.
- Ships as a patch release.

## Testing

New regression coverage in `packages/python/tests/`:

1. **`test_lazy_import.py`** — simulates `fastapi` genuinely not being
   installed by setting `sys.modules["fastapi"] = None`, Python's documented
   mechanism for making a subsequent `import fastapi` fail (verified: it
   raises `ModuleNotFoundError: import of fastapi halted; None in
   sys.modules`, and `ModuleNotFoundError` subclasses `ImportError`). Two
   cases:
   - `import mythos_sdk` does not raise, and `verify_launch_token` /
     `report_usage` are both reachable and callable.
   - Accessing `mythos_sdk.handshake_router` under the same conditions
     **does** raise `ImportError` — proving the dependency is real when the
     feature is actually used, rather than silently broken.

   **Each case must run in a subprocess, not by mutating `sys.modules`
   inside the pytest session.** This is a correctness requirement, not a
   style preference. The in-process version would have to purge cached
   `mythos_sdk*` entries from `sys.modules` to force a fresh import, and
   that re-import creates a *second* set of submodule objects. The existing
   suite patches by string —
   `patch("mythos_sdk.handshake.get_jwks", ...)` in
   `tests/test_handshake.py:28,98,108` — which resolves the module fresh at
   patch time, while `test_handshake.py:9`'s already-imported
   `create_handshake_router` closes over the *original* module's globals.
   The patch would land on one module object and the code under test would
   read the other, silently disabling those mocks in a test-order-dependent
   way. A subprocess sidesteps the whole hazard: nothing in the parent
   interpreter is touched.

2. **Existing `test_handshake.py`, `test_middleware.py`,
   `test_listing_callback.py`** (unmodified) must continue to pass — they
   import `create_handshake_router` / `require_launch_token` /
   `create_listing_callback_handler` from `mythos_sdk` and exercise them
   with real `fastapi`/`httpx`, proving the lazy path still resolves
   correctly and behaves identically when the feature is actually used.
   `tests/test_handshake.py:10` also imports `SDK_VERSION` from
   `mythos_sdk.version` directly, which stays eager and unaffected.

Full command: `cd packages/python && pip install -e ".[dev]" && pytest -q`
(matches `.github/workflows/ci.yml`'s existing `python` job — no CI config
changes needed).
