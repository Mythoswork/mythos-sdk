# Python SDK overview

API reference for `mythos-sdk` — the official Mythos SDK for Python.

{% hint style="info" %}
**Just getting started?** [Quickstart: Python](../../getting-started/quickstart-python.md)
{% endhint %}

## Install

```bash
pip install "mythos-sdk[fastapi]"
```

## Exports

| Export | Description |
|--------|-------------|
| `handshake_router` | Pre-built FastAPI router for publish handshake |
| `create_handshake_router` | Factory for customizable handshake router |
| `create_listing_callback_handler` | Handler for listing registration callback |
| `require_launch_token` | FastAPI dependency — verify + consume |
| `verify_launch_token` | Low-level JWT verify |
| `report_usage` | Debit Consumer wallet |
| `MythosSession` | Session dataclass |
| `MythosError` | Base error |
| `InsufficientFundsError` | Wallet has no credits |
| `SessionNotFoundError` | Session JTI not found |

## MythosSession

```python
@dataclass
class MythosSession:
    userId: str
    email: str
    displayName: str
    listingId: str
    sessionJti: str  # camelCase — matches Node SDK
```

## Pages

- [handshake_router](handshake-router.md)
- [create_listing_callback_handler](create-listing-callback-handler.md)
- [require_launch_token](require-launch-token.md)
- [verify_launch_token](verify-launch-token.md)
- [report_usage](report-usage.md)
- [Errors](errors.md)
- [Configuration](configuration.md)
