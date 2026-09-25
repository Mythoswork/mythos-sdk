from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx

from mythos_sdk.__main__ import doctor, main


API_URL = "https://api.mythos.work"
VALID_ENV = {
    "MYTHOS_SESSION_SECRET": "s" * 32,
    "MYTHOS_LISTING_ID": "listing-1",
}


def response(status_code: int, payload: dict[str, object]) -> httpx.Response:
    return httpx.Response(status_code, json=payload, request=httpx.Request("GET", API_URL))


def run_doctor(tmp_path: Path, env: dict[str, str], responses: list[httpx.Response]) -> tuple[int, str]:
    output: list[str] = []
    client = MagicMock()
    client.__enter__.return_value = client
    client.get.side_effect = responses
    with patch("mythos_sdk.__main__.httpx.Client", return_value=client) as client_class:
        result = doctor(cwd=tmp_path, process_env=env, write=output.append)
    client_class.assert_called_once_with(timeout=5.0)
    return result, "\n".join(output)


def test_doctor_all_checks_pass(tmp_path: Path):
    result, output = run_doctor(
        tmp_path,
        VALID_ENV,
        [
            response(200, {"keys": [{"kid": "key-1"}]}),
            response(200, {"success": True, "data": {"title": "Calc"}}),
        ],
    )

    assert result == 0
    assert "✔ Listing listing-1: Calc" in output
    assert output.endswith("6 passed, 0 failed")


def test_doctor_short_secret_fails(tmp_path: Path):
    result, output = run_doctor(
        tmp_path,
        {**VALID_ENV, "MYTHOS_SESSION_SECRET": "twelve-chars"},
        [
            response(200, {"keys": [{"kid": "key-1"}]}),
            response(200, {"success": True, "data": {"title": "Calc"}}),
        ],
    )

    assert result == 1
    assert "MYTHOS_SESSION_SECRET is 12 chars" in output
    assert "openssl rand -base64 32" in output


def test_doctor_listing_not_found_fails(tmp_path: Path):
    result, output = run_doctor(
        tmp_path,
        VALID_ENV,
        [response(200, {"keys": [{}]}), response(404, {"error": "not found"})],
    )

    assert result == 1
    assert "Listing listing-1 not found or not published" in output


def test_doctor_jwks_network_error_skips_listing_check(tmp_path: Path):
    output: list[str] = []
    client = MagicMock()
    client.__enter__.return_value = client
    client.get.side_effect = httpx.ConnectError("connection refused")

    with patch("mythos_sdk.__main__.httpx.Client", return_value=client):
        result = doctor(cwd=tmp_path, process_env=VALID_ENV, write=output.append)

    rendered = "\n".join(output)
    assert result == 1
    assert "Cannot reach https://api.mythos.work (connection refused)" in rendered
    assert "- skipped" in rendered


def test_doctor_parses_env_local_quotes_comments_and_precedence(tmp_path: Path):
    (tmp_path / ".env.local").write_text(
        "# local config\nMYTHOS_SESSION_SECRET='" + "l" * 32 + "'\nMYTHOS_LISTING_ID=local-id\n",
        encoding="utf-8",
    )
    (tmp_path / ".env").write_text(
        'MYTHOS_SESSION_SECRET="short"\nMYTHOS_LISTING_ID=env-id\n', encoding="utf-8"
    )
    result, output = run_doctor(
        tmp_path,
        {"MYTHOS_LISTING_ID": "process-id"},
        [
            response(200, {"keys": [{}]}),
            response(200, {"success": True, "data": {"title": "Process listing"}}),
        ],
    )

    assert result == 0
    assert "Listing process-id: Process listing" in output


def test_doctor_invalid_api_url_skips_network_checks(tmp_path: Path):
    output: list[str] = []
    with patch("mythos_sdk.__main__.httpx.Client") as client_class:
        result = doctor(
            cwd=tmp_path,
            process_env={**VALID_ENV, "MYTHOS_API_URL": "ftp://api.example.com"},
            write=output.append,
        )

    assert result == 1
    assert "MYTHOS_API_URL must be an http(s) URL" in "\n".join(output)
    assert "- API reachable: skipped" in output
    assert "- skipped" in output
    client_class.assert_not_called()


def test_doctor_handles_malformed_ipv6_api_url(tmp_path: Path):
    output: list[str] = []
    with patch("mythos_sdk.__main__.httpx.Client") as client_class:
        result = doctor(
            cwd=tmp_path,
            process_env={**VALID_ENV, "MYTHOS_API_URL": "http://[broken"},
            write=output.append,
        )

    assert result == 1
    assert "MYTHOS_API_URL must be an http(s) URL" in output
    client_class.assert_not_called()


def test_doctor_rejects_api_url_without_a_hostname(tmp_path: Path):
    output: list[str] = []
    with patch("mythos_sdk.__main__.httpx.Client") as client_class:
        result = doctor(
            cwd=tmp_path,
            process_env={**VALID_ENV, "MYTHOS_API_URL": "http://user@"},
            write=output.append,
        )

    assert result == 1
    assert "MYTHOS_API_URL must be an http(s) URL" in output
    client_class.assert_not_called()


def test_doctor_handles_unexpected_jwks_shape(tmp_path: Path):
    result, output = run_doctor(tmp_path, VALID_ENV, [response(200, {"unexpected": []})])

    assert result == 1
    assert "JWKS contains no keys" in output


def test_doctor_reports_listing_network_errors_without_misreporting_api(tmp_path: Path):
    output: list[str] = []
    client = MagicMock()
    client.__enter__.return_value = client
    client.get.side_effect = [
        response(200, {"keys": [{}]}),
        httpx.ConnectError("listing connection refused"),
    ]
    with patch("mythos_sdk.__main__.httpx.Client", return_value=client):
        result = doctor(cwd=tmp_path, process_env=VALID_ENV, write=output.append)

    assert result == 1
    assert "run-info returned listing connection refused" in output
    assert "API is not reachable" not in output


def test_doctor_redacts_api_url_credentials(tmp_path: Path):
    result, output = run_doctor(
        tmp_path,
        {**VALID_ENV, "MYTHOS_API_URL": "https://user:secret@api.mythos.work?token=hidden"},
        [response(200, {"keys": [{}]}), response(200, {"data": {"title": "Calc"}})],
    )

    assert result == 0
    assert "secret" not in output
    assert "hidden" not in output


def test_doctor_missing_listing_is_warning_not_failure(tmp_path: Path):
    result, output = run_doctor(
        tmp_path,
        {"MYTHOS_SESSION_SECRET": "s" * 32},
        [response(200, {"keys": [{}]})],
    )

    assert result == 0
    assert "! MYTHOS_LISTING_ID not set" in output
    assert output.endswith("4 passed, 0 failed")


def test_main_prints_usage_for_no_args_and_help(capsys):
    assert main([]) == 0
    assert main(["--help"]) == 0
    assert capsys.readouterr().out == (
        "Usage: python -m mythos_sdk doctor\nUsage: python -m mythos_sdk doctor\n"
    )


def test_main_rejects_unknown_command(capsys):
    assert main(["unknown"]) == 2
    assert capsys.readouterr().out == "Usage: python -m mythos_sdk doctor\n"


def test_doctor_warns_when_config_is_only_in_env_file(tmp_path: Path):
    (tmp_path / ".env").write_text("MYTHOS_SESSION_SECRET=" + "s" * 32 + "\nMYTHOS_LISTING_ID=listing-1\n")
    ok = [response(200, {"keys": [{"kid": "key-1"}]}), response(200, {"success": True, "data": {"title": "Calc"}})]

    _, file_only = run_doctor(tmp_path, {}, list(ok))
    _, exported = run_doctor(tmp_path, VALID_ENV, list(ok))

    assert "found only in .env" in file_only
    assert "found only in .env" not in exported
