from __future__ import annotations

import os
import sys
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx


USAGE = "Usage: python -m mythos_sdk doctor"
DEFAULT_API_URL = "https://api.mythos.work"


def _parse_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def _load_env(cwd: Path, process_env: Mapping[str, str]) -> dict[str, str]:
    env: dict[str, str] = {}
    for filename in (".env.local", ".env"):
        for key, value in _parse_env_file(cwd / filename).items():
            env.setdefault(key, value)
    env.update(process_env)
    return env


REQUIRED_ENV = ("MYTHOS_SESSION_SECRET", "MYTHOS_LISTING_ID", "MYTHOS_LISTING_IDS")


def _only_in_env_file(cwd: Path, process_env: Mapping[str, str]) -> bool:
    # uvicorn/FastAPI never read .env on their own; only the start command can load it.
    file_env = {**_parse_env_file(cwd / ".env"), **_parse_env_file(cwd / ".env.local")}
    return any(file_env.get(key) and not process_env.get(key) for key in REQUIRED_ENV)


def _listing_ids(env: Mapping[str, str]) -> list[str]:
    multiple = env.get("MYTHOS_LISTING_IDS", "")
    if multiple:
        return [listing_id.strip() for listing_id in multiple.split(",") if listing_id.strip()]
    single = env.get("MYTHOS_LISTING_ID", "").strip()
    return [single] if single else []


def _is_http_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        parsed.port
        return parsed.scheme in {"http", "https"} and bool(parsed.hostname)
    except ValueError:
        return False


def _display_url(value: str) -> str:
    parsed = urlparse(value)
    hostname = parsed.hostname or ''
    host = f'[{hostname}]' if ':' in hostname else hostname
    if parsed.port is not None:
        host = f'{host}:{parsed.port}'
    return parsed._replace(netloc=host, query='', fragment='').geturl().rstrip('/')


def doctor(
    *,
    cwd: Path | None = None,
    process_env: Mapping[str, str] | None = None,
    write: Callable[[str], object] = print,
) -> int:
    root = cwd or Path.cwd()
    source_env = process_env if process_env is not None else os.environ
    env = _load_env(root, source_env)
    passed = 0
    failed = 0

    secret = env.get("MYTHOS_SESSION_SECRET", "")
    if secret:
        write("✔ MYTHOS_SESSION_SECRET is set")
        passed += 1
    else:
        write("✖ MYTHOS_SESSION_SECRET is not set")
        write("Set MYTHOS_SESSION_SECRET (≥32 chars): openssl rand -base64 32")
        failed += 1

    if _only_in_env_file(root, source_env):
        write(
            "! MYTHOS_* found only in .env — make sure your start command loads it "
            "(node --env-file=.env … / uvicorn --env-file .env)"
        )

    if len(secret) >= 32:
        write("✔ MYTHOS_SESSION_SECRET is at least 32 chars")
        passed += 1
    else:
        write("✖ MYTHOS_SESSION_SECRET is too short")
        write(
            f"MYTHOS_SESSION_SECRET is {len(secret)} chars; regenerate with openssl rand -base64 32 "
            "(and update your host's env, e.g. Vercel)"
        )
        failed += 1

    listing_ids = _listing_ids(env)
    if listing_ids:
        write(f"✔ {len(listing_ids)} Mythos listing ID(s) configured")
        passed += 1
    else:
        write(
            "! MYTHOS_LISTING_ID not set — fine only if your code passes resolveListingIds to createMythos()"
        )

    api_url = env.get("MYTHOS_API_URL", DEFAULT_API_URL).rstrip("/")
    is_valid_api_url = _is_http_url(api_url)
    shown_api_url = _display_url(api_url) if is_valid_api_url else api_url
    if is_valid_api_url:
        write(f"✔ MYTHOS_API_URL is valid ({shown_api_url})")
        passed += 1
    else:
        write("✖ MYTHOS_API_URL is invalid")
        write("MYTHOS_API_URL must be an http(s) URL")
        failed += 1
        write("- API reachable: skipped")
        write("- skipped")

    if is_valid_api_url:
        is_api_reachable = False
        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.get(f"{api_url}/.well-known/jwks.json")
                payload = response.json() if response.status_code == 200 else None
                keys = payload.get("keys", []) if isinstance(payload, dict) else []
                if response.status_code == 200 and isinstance(keys, list) and keys:
                    write(f"✔ API reachable ({shown_api_url})")
                    passed += 1
                    is_api_reachable = True
                else:
                    detail = str(response.status_code)
                    if response.status_code == 200:
                        detail = "JWKS contains no keys"
                    write("✖ API is not reachable")
                    write(f"Cannot reach {shown_api_url} ({detail}). Check MYTHOS_API_URL / network.")
                    failed += 1

                if is_api_reachable and listing_ids:
                    for listing_id in listing_ids:
                        try:
                            run_info = client.get(f"{api_url}/api/apps/{quote(listing_id, safe='')}/run-info")
                            if run_info.status_code == 200:
                                run_payload = run_info.json()
                                data = run_payload.get("data") if isinstance(run_payload, dict) else None
                                title = data.get("title", "") if isinstance(data, dict) else ""
                                write(f"✔ Listing {listing_id}: {title}")
                                passed += 1
                            elif run_info.status_code == 404:
                                write(f"✖ Listing {listing_id} is unavailable")
                                write(
                                    f"Listing {listing_id} not found or not published on {shown_api_url}. "
                                    "Check the ID and that the listing is published."
                                )
                                failed += 1
                            else:
                                write(f"✖ Listing {listing_id} check failed")
                                write(f"run-info returned {run_info.status_code}")
                                failed += 1
                        except (httpx.HTTPError, ValueError, TypeError, AttributeError) as error:
                            write(f"✖ Listing {listing_id} check failed")
                            write(f"run-info returned {error}")
                            failed += 1
                elif not is_api_reachable:
                    write("- skipped")
                else:
                    write("- skipped")
        except (httpx.HTTPError, ValueError) as error:
            write("✖ API is not reachable")
            write(f"Cannot reach {shown_api_url} ({error}). Check MYTHOS_API_URL / network.")
            failed += 1
            write("- skipped")

    write(f"{passed} passed, {failed} failed")
    return 1 if failed else 0


def main(argv: Sequence[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args == ["--help"]:
        print(USAGE)
        return 0
    if args != ["doctor"]:
        print(USAGE)
        return 2
    return doctor()


if __name__ == "__main__":
    raise SystemExit(main())
