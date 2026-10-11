:::caution Advanced — 0.0.x primitives
You don't need this page for a normal integration. Use the [quickstarts](/getting-started/quickstart-nextjs-app) and `createMythos()` instead. These low-level functions remain exported for custom setups.
:::

# Configuration (Python)

Environment variables read by `mythos-sdk`.

## Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MYTHOS_KEY` | Soft in 0.5.0; required in 0.6.0 | — | Dashboard → Settings → Mythos key; binds launch, handshake and callback tokens |
| `MYTHOS_LISTING_ID` | Yes* | — | Single listing ID |
| `MYTHOS_LISTING_IDS` | Yes* | — | Comma-separated IDs |
| `MYTHOS_API_URL` | No | `https://api.mythos.work` | Mythos API base URL |

\*Not required if `resolve_listing_ids` returns at least one ID.

With a key, missing or mismatched `pkh` rejects with `ProducerMismatchError`. Without a key, static listing launches remain silent; dynamic launches, handshake and callbacks warn once per process. See the [shared binding contract](../configuration.md).

## load_config

```python
@dataclass
class MythosConfig:
    listing_ids: list[str]
    api_url: str
```

## Examples

```env
# Mythos dashboard → Settings → Mythos key
MYTHOS_KEY=
MYTHOS_LISTING_ID=abc-123
MYTHOS_LISTING_IDS=abc-123,def-456
MYTHOS_API_URL=http://localhost:5001
```

## See also

- [Install](../../getting-started/install.md)
- [Dynamic listing IDs](../../concepts/dynamic-listing-ids.md)
