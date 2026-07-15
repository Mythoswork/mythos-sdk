# mythos-sdk

Python SDK for Mythos producers.

## Install

```bash
pip install "mythos-sdk[fastapi]"
```

FastAPI is optional but required for `require_launch_token` and `handshake_router`.

## Development

```bash
pip install -e ".[dev]"
pytest
```

If you use [uv](https://docs.astral.sh/uv/):

```bash
uv sync --group dev
uv run pytest
```

## Publishing

```bash
pip install build
python -m build
```
