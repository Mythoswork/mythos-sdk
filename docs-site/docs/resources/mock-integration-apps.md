# Mock integration apps

These reference implementations demonstrate the high-level API end to end.

| Stack | Repository | API demonstrated |
|---|---|---|
| Next.js (Pages Router) | [mythos-sdk-node-js-mock-integration-app](https://github.com/Mythoswork/mythos-sdk-node-js-mock-integration-app) | `createMythos`, `mythos.handlers` via `pagesHandler`, `useMythos`, `mythos.charge`, `mythos.llm` |
| FastAPI | [mythos-sdk-python-mock-integration-app](https://github.com/Mythoswork/mythos-sdk-python-mock-integration-app) | `create_mythos`, `mythos.router`, `mythos.charge`, `mythos.llm` |

Use the mock apps to inspect complete project structure and test a real dashboard launch. For a new integration, copy the smaller [framework quickstart](../resources/code-examples.md) rather than copying an entire mock application. The mocks also include test-harness routes (`harness/*`) that real apps do not need.

## Callback and handshake wiring

This is the part integrators most often get wrong. You enter two URLs on the Listing:

| Listing field | Enter | Mythos calls |
|---|---|---|
| Launch URL | The page users open, e.g. `https://app.example.com` | Loads it in an iframe with `?lt=<launch token>`, and before publish sends `GET <Launch URL>/.well-known/mythos-handshake?lt=…` |
| Callback URL (optional) | The **full** endpoint URL, e.g. `https://app.example.com/.well-known/mythos-listing-registered` | `POST <Callback URL>?lt=…` when the Listing is created, exactly as entered (no path is appended) |

Where each mock wires it:

| | Next.js mock | FastAPI mock |
|---|---|---|
| Register the callback | `lib/mythos.ts`: `createMythos({ resolveListingIds: getListingIds, onListingRegistered: addListingId })` | `main.py`: `create_mythos(resolve_listing_ids=get_listing_ids, on_listing_registered=add_listing_id)` |
| Store Listing IDs | `lib/listing-ids-store.ts`: Redis (Upstash) in production, local file in dev | `listing_ids_store.py` |
| Serve the routes | `pages/api/mythos/[...mythos].ts` (`pagesHandler(mythos)`) plus `next.config.ts` rewrites from `/.well-known/mythos-handshake` and `/.well-known/mythos-listing-registered` to `/api/mythos/*` | `app.include_router(mythos.router)` serves `/.well-known/mythos-handshake`, `/.well-known/mythos-listing-registered` and `/api/mythos/session` directly |

Notes:

- The callback is only useful together with `resolveListingIds` / `resolve_listing_ids`. With a static `MYTHOS_LISTING_ID`, leave Callback URL empty.
- The SDK returns HTTP 200 once your `onListingRegistered` resolves. Keep that function idempotent.
- On Vercel and other serverless hosts, the callback and session routes run in separate instances. Store IDs in shared storage, as the Next.js mock does with Redis.
- A Launch URL with a path (`https://app.example.com/calc`) gets its handshake at `https://app.example.com/calc/.well-known/mythos-handshake`.
