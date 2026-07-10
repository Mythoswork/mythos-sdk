# Configuration (Python)

Environment variables read by `mythos-sdk`.

## Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MYTHOS_LISTING_ID` | Yes* | — | Single listing ID |
| `MYTHOS_LISTING_IDS` | Yes* | — | Comma-separated IDs |
| `MYTHOS_API_URL` | No | `https://api.mythos.work` | Mythos API base URL |

\*Not required if `resolve_listing_ids` returns at least one ID.

## load_config

```python
@dataclass
class MythosConfig:
    listing_ids: list[str]
    api_url: str
```

## Examples

```env
MYTHOS_LISTING_ID=abc-123
MYTHOS_LISTING_IDS=abc-123,def-456
MYTHOS_API_URL=http://localhost:5001
```

## See also

- [Install](../../getting-started/install.md)
- [Dynamic listing IDs](../../concepts/dynamic-listing-ids.md)
