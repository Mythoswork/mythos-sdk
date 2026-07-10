# Next.js

Run `@mythos/sdk` Express handlers inside Next.js App Router Route Handlers.

{% hint style="info" %}
**Shim stub:** [next-mythos-shim.ts](../examples/next-mythos-shim.ts)
{% endhint %}

## Why a shim?

The SDK exports Express-style handlers. Next.js Route Handlers use the Web `Request`/`Response` API. A thin adapter bridges the two.

## lib/mythos.ts

Copy [next-mythos-shim.ts](../examples/next-mythos-shim.ts) to `lib/mythos.ts`.

## Route handlers

Set `export const runtime = "nodejs"` on all Mythos routes — JWKS fetch requires Node.

### Handshake

`app/.well-known/mythos-handshake/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { runHandshake } from '@/lib/mythos';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const lt = request.nextUrl.searchParams.get('lt');
  const { status, body } = await runHandshake(lt);
  return NextResponse.json(body, { status });
}
```

### Session

`app/api/mythos/session/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { verifyAndConsumeLaunchToken } from '@/lib/mythos';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const lt = request.nextUrl.searchParams.get('lt');
  if (!lt) {
    return NextResponse.json({ error: 'Missing launch token' }, { status: 401 });
  }
  const { status, body } = await verifyAndConsumeLaunchToken(lt);
  return NextResponse.json(body, { status });
}
```

### Report usage

`app/api/mythos/report-usage/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { reportUsage, MythosError } from '@mythos/sdk';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { sessionJti, credits, reason } = await request.json();
  try {
    await reportUsage(sessionJti, { credits, reason });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MythosError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    return NextResponse.json({ error: 'Failed to report usage' }, { status: 503 });
  }
}
```

## Frontend

Use the same [frontend client](frontend-client.md) pattern in a client component. Call `initMythosFromUrl()` in `useEffect` on your root layout or page.

## Environment

Add `MYTHOS_LISTING_ID` to `.env.local`. Vercel: set in project Environment Variables.

## Next steps

- [Vercel serverless](vercel-serverless.md) — rewrites and multi-entry warnings
- [Frontend client](frontend-client.md)
- [Verify your integration](../getting-started/verify-integration.md)
