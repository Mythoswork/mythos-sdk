# Configuration (Node.js)

Environment variables read by `@mythos-work/sdk`.

## Variables

| Variable             | Required | Default                   | Description                              |
| ----------------------| ----------| ---------------------------| ------------------------------------------|
| `MYTHOS_LISTING_ID`  | No*      | —                         | Single listing ID                        |
| `MYTHOS_LISTING_IDS` | No*      | —                         | Comma-separated IDs; overrides single ID |
| `MYTHOS_API_URL`     | No       | `https://api.mythos.work` | Mythos API base URL                      |

\*Not required if `resolveListingIds` returns at least one ID.

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
