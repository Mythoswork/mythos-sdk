# `createMythos`

`createMythos()` is the high-level Node server API. Python provides the equivalent `create_mythos()` factory.

## Create a client

```ts
import { createMythos } from '@mythos-work/sdk';

export const mythos = createMythos({
  resolveListingIds: async () => ['listing-id'],
  onListingRegistered: async (listingId) => saveListingId(listingId),
});
```

Both options are optional. `resolveListingIds` provides dynamic listing IDs; `onListingRegistered` enables the listing-registered callback route.

```python
from mythos_sdk import create_mythos

mythos = create_mythos(
    resolve_listing_ids=get_listing_ids,
    on_listing_registered=save_listing_id,
)
```

## `handlers` / `router`

`mythos.handlers` contains web-standard `GET` and `POST` handlers for Next.js App Router.

```ts
export const { GET, POST } = mythos.handlers;
```

Pages Router uses `pagesHandler(mythos)` from `@mythos-work/sdk/next`. Express uses `mythosExpress(mythos)` from `@mythos-work/sdk/express`.

```python
app.include_router(mythos.router)
```

The Node handlers serve:

- `GET /api/mythos/session`
- `GET /api/mythos/handshake`
- `GET|POST /api/mythos/listing-registered` when `onListingRegistered` is set

Next.js maps the well-known paths with [the required rewrites](../getting-started/quickstart-nextjs-app.md). Express also serves `/.well-known/mythos-handshake` and `/.well-known/mythos-listing-registered` directly. The Python router serves `/api/mythos/session` and the two `/.well-known/mythos-*` routes directly; it does not expose `/api/mythos/listing-registered`.

## `getSession` / `get_session`

```ts
const session = await mythos.getSession(req);
```

Returns `{ userId, email, displayName, listingId, sessionJti }` for a Mythos launch, or `null` when opened standalone. `req` may be a web `Request`, `NextApiRequest`, or Express request; it only needs `headers`.

```python
session = await mythos.get_session(request)
```

Returns `MythosSession | None`.

## `charge`

```ts
const result = await mythos.charge(req, {
  credits: 1,
  reason: 'calculate',
  idempotencyKey,
  consentId,
});
```

Returns `{ chargeId, sessionMeteredTotal }`. `reason`, `idempotencyKey`, and `consentId` are optional.

```python
result = await mythos.charge(
    request,
    credits=1,
    reason="calculate",
    idempotency_key=idempotency_key,
    consent_id=consent_id,
)
```

## `llm`

```ts
const client = await mythos.llm<OpenAI>(req, {
  apiKey: process.env.OPENAI_API_KEY,
  fallback: ownOpenAiClient,
  baseURL: 'https://api.openai.com/v1',
  timeout: 30_000,
});
```

Returns an OpenAI client routed through the Mythos gateway, typed as your own `OpenAI` (pass it as the type argument; `fallback` should be the same type). `fallback` is used when there is no Mythos session; all options shown are optional. Browser-side, LLM calls are confirmed with `confirmCharge({ kind: 'llm', reason })` — no credits, because the cost is usage-based.

```python
client = await mythos.llm(request, api_key="...", fallback=own_openai_client)
```

Python LLM support requires `pip install "mythos-sdk[llm]"`.

## `billing`

```ts
const billing = mythos.billing(completion);
```

Returns the completion's Mythos metadata, including `mythos_charge_credits`, `mythos_cost_microunits`, `mythos_pricing_source`, and optionally `mythos_billing_status`, or `null` when no billing metadata is present.

```python
billing = mythos.billing(completion)
```
