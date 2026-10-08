:::caution Advanced — 0.0.x primitives
You don't need this page for a normal integration. Use the [quickstarts](/getting-started/quickstart-nextjs-app) and `createMythos()` instead. These low-level functions remain exported for custom setups.
:::

# Configuration (Node.js)

Environment variables read by `@mythos-work/sdk`.

## Variables

| Variable             | Required | Default                   | Description                              |
| ----------------------| ----------| ---------------------------| ------------------------------------------|
| `MYTHOS_KEY` | Soft in 0.5.0; required in 0.6.0 | — | Dashboard → Settings → Mythos key; binds launch, handshake and callback tokens |
| `MYTHOS_LISTING_ID`  | No*      | —                         | Single listing ID                        |
| `MYTHOS_LISTING_IDS` | No*      | —                         | Comma-separated IDs; overrides single ID |
| `MYTHOS_API_URL`     | No       | `https://api.mythos.work` | Mythos API base URL                      |

\*Not required if `resolveListingIds` returns at least one ID.

With a key, missing or mismatched `pkh` rejects with `ProducerMismatchError`. Without a key, static listing launches remain silent; dynamic launches, handshake and callbacks warn once per process. See the [shared binding contract](../configuration.md).

## loadConfig

Internal function used by verify and API client:

```typescript
interface MythosConfig {
  listingIds: string[];
  apiUrl: string;
  resolveListingIds?: () => Promise<string[]>;
}
```

## Examples

```env
MYTHOS_KEY=              # Mythos dashboard → Settings → Mythos key
# Single listing
MYTHOS_LISTING_ID=abc-123

# Multiple listings
MYTHOS_LISTING_IDS=abc-123,def-456

# Local backend
MYTHOS_API_URL=http://localhost:5001
```

## See also

- [Install](../../getting-started/install.md)
- [Dynamic listing IDs](../../concepts/dynamic-listing-ids.md)
