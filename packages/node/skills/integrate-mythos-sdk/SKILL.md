---
name: integrate-mythos-sdk
description: Install and integrate the Mythos SDK (launch, sessions, USD or credit charges, LLM billing) into a Next.js, Express or FastAPI app, starting from an app that may not have the SDK yet. Use when the user asks to add Mythos, connect an app to Mythos, or bill through Mythos. Do not use for unrelated payment or auth work.
---

# Integrate Mythos SDK

## Step 0: set up (skip what is already there)

1. Find the app: the directory with `package.json`, or `pyproject.toml` / `requirements.txt`. If the repo holds several apps, ask the user which one before changing anything.
2. Detect the stack from dependencies: `next` (with `app/` or `pages/`) = Next.js; `express` = Express; `fastapi` = FastAPI. Any other stack: stop, tell the user it is unsupported, and point to https://docs.mythos.work. Do not improvise an integration.
3. Use the package manager the lockfile names. Look in the app folder, then parent folders up to the repo root (workspaces keep it at the root): `pnpm-lock.yaml` = pnpm, `yarn.lock` = yarn, `bun.lock` or `bun.lockb` = bun, otherwise npm. Python: `uv.lock` = uv, `poetry.lock` = poetry, otherwise pip inside the project's virtualenv (never system Python). Use only that manager.
4. Install the SDK only if missing. Node: `@mythos-work/sdk`. Python: `mythos-sdk[fastapi]`, plus `[llm]` if the app calls an LLM (`uv add`, `poetry add`, or `pip install`). If it is present, keep the installed version.
5. If the install fails, read https://docs.mythos.work/llms-full.txt and tell the user you used that fallback, because it may not match the installed version.

## Steps

1. Read `node_modules/@mythos-work/sdk/AGENTS.md` (Python: `AGENTS.md` in the folder printed by `python -c "import mythos_sdk, os; print(os.path.dirname(mythos_sdk.__file__))"`) and follow it exactly. That file matches the installed version, so it wins over anything else.
2. Node: run `npx @mythos-work/sdk init`, then apply the one manual step it prints (Next.js rewrites or `app.use(mythosExpress(mythos))`). FastAPI has no `init`: add `app.include_router(mythos.router)` directly.
3. Credentials: run `npx @mythos-work/sdk link` yourself (Python apps too). It prints a URL and a code: show both to the user and ask them to approve in the browser. It waits up to 10 minutes (run it in the background if your tool times out sooner), then writes `MYTHOS_KEY`, `MYTHOS_LISTING_ID` and `MYTHOS_SESSION_SECRET` and prints them masked. If you only need the session secret, run `npx @mythos-work/sdk secret`. Never open, read or print the env file. If `link` fails, ask the user to copy the values from the Mythos dashboard.
4. Use only `createMythos()` / `create_mythos()` on the server and `useMythos()` (React) or `Mythos.initMythos()` (other pages) in the browser.
5. Never parse launch tokens (`lt`), set Mythos cookies, store Mythos tokens, or call `/consume` / `/meter` directly.
6. Outside Mythos `confirmCharge` asks nobody and resolves `{ approved: false, standalone: true }`. On `result.standalone` run the app's own login/paywall; act only on `result.approved`. Fixed-price routes skip `charge` when `getSession` is null.
7. Fixed-price actions: use the same amount in `confirmCharge({ usd: 0.15, reason })` in the browser and `mythos.charge(req, { usd: 0.15, reason, consentId })` on the server after approval. Alternatively, use `credits: 1500` directly in both. USD confirmation needs an `initMythos` / `useMythos` session rate or rejects with `USD_RATE_UNAVAILABLE`; the popup shows credits. Outside Mythos a `usd` amount is validated without needing a rate. The bare `confirmCharge` export (without `initMythos`) is credits-only.
8. LLM calls are usage-based: `confirmCharge({ kind: 'llm', reason })` with no credits, then `mythos.llm(req, …)` (Python `await mythos.llm(request, …)`) + `mythos.billing(completion)`. Add `standalone: true` (Python `standalone=True`) only for apps that serve their own signed-in users; it runs on the producer's key.
9. Map every `MythosError` to `err.httpStatus` (Python: `err.http_status`) and `err.code`.
10. Express/FastAPI do not load `.env` automatically: start with `node --env-file=.env server.js` or `uvicorn main:app --env-file .env`.
11. Run `npx @mythos-work/sdk doctor` (Python: `python -m mythos_sdk doctor`) until every ✖ is fixed.
12. The Listing's Callback URL is the **full** endpoint (e.g. `https://app.example.com/.well-known/mythos-listing-registered`), POSTed exactly as entered; the handshake is derived from the Launch URL. See "URLs Mythos Calls" in `AGENTS.md`.
13. For real wiring, read the reference apps: https://github.com/Mythoswork/mythos-sdk-node-js-mock-integration-app (Next.js) and https://github.com/Mythoswork/mythos-sdk-python-mock-integration-app (FastAPI).

## Deployment environment

```dotenv
# openssl rand -base64 32  (>= 32 chars)
MYTHOS_SESSION_SECRET=
# Mythos dashboard → Settings → Mythos key
MYTHOS_KEY=
```

Copy the current Producer key into the server environment and redeploy after regeneration. Missing keys are a soft warning with auto-registration; static `MYTHOS_LISTING_ID(S)` launches without a key remain silent. `MYTHOS_KEY` will be required in a future release. The bundled `AGENTS.md` defines the binding matrix, warning and mismatch responses.

| Troubleshooting code | Fix |
|---|---|
| `PRODUCER_MISMATCH` | The `MYTHOS_KEY` in this deployment belongs to a different Producer, or was regenerated. Copy the current key from the dashboard and redeploy. |
