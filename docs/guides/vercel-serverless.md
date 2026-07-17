# Vercel serverless

Deploy Mythos SDK routes on Vercel with serverless functions and rewrites.

{% hint style="info" %}
**Also see:** [Next.js guide](nextjs.md) for App Router · [Express](express.md) for traditional servers
{% endhint %}

## One handler per route

Place handlers under `api/`:

**`api/mythos-handshake.js`:**

```javascript
const { handshakeRoute } = require('@mythos/sdk');
const router = handshakeRoute();
// Export the handshake GET handler from the router stack
module.exports = (req, res) => router(req, res, () => res.status(404).end());
```

For a cleaner setup, use the Next.js App Router pattern in [nextjs.md](nextjs.md) instead of raw `api/` files.

**`api/mythos-session.js`:**

```javascript
const { requireLaunchToken } = require('@mythos/sdk');
const middleware = requireLaunchToken();
module.exports = (req, res) =>
  middleware(req, res, () => res.status(200).json({ ok: true, session: req.mythos }));
```

## Handshake rewrite

Vercel serves `api/` routes at `/api/*` by default. Mythos expects the handshake at `/.well-known/mythos-handshake`. Add a rewrite in `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/.well-known/mythos-handshake",
      "destination": "/api/mythos-handshake"
    }
  ]
}
```

Without this rewrite, the publish gate gets 404 — Mythos will not accept `/api/mythos-handshake` as a substitute path.

## Multiple entry points

{% hint style="warning" %}
A common failure mode: Mythos routes wired in `backend/main.py` for local dev but missing from `api/index.py` (or Vercel `api/`). Production returns 404 while local works. Wire Mythos on **every** deploy entry point.
{% endhint %}

## Environment variables

Set in Vercel project settings:

- `MYTHOS_LISTING_ID`
- `MYTHOS_API_URL` (if not using production API)

## Node runtime

Ensure serverless functions use Node.js runtime, not Edge — JWKS verification requires Node `fetch` and crypto.

## Next steps

- [Required routes](required-routes.md) — exact paths
- [Troubleshooting](../resources/troubleshooting.md) — duplicate entry point issues
- [Verify your integration](../getting-started/verify-integration.md)
