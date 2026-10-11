---
name: integrate-mythos-sdk
description: Integrate the Mythos SDK (launch, sessions, credit charges, LLM billing) into a Next.js, Express or FastAPI app. Use when the user asks to add Mythos, connect an app to Mythos, or bill Mythos credits. Do not use for unrelated payment or auth work.
---

# Integrate Mythos SDK

1. Read `node_modules/@mythos-work/sdk/AGENTS.md` (Python: `site-packages/mythos_sdk/AGENTS.md`) and follow it exactly. If neither is installed, read https://docs.mythos.work/llms-full.txt.
2. Run `npx @mythos-work/sdk init`, then apply the one manual step it prints (Next.js rewrites, `app.use(mythosExpress(mythos))`, or `app.include_router(mythos.router)`).
3. Use only `createMythos()` / `create_mythos()` on the server and `useMythos()` (React) or `Mythos.initMythos()` (other pages) in the browser.
4. Never parse launch tokens (`lt`), set Mythos cookies, store Mythos tokens, or call `/consume` / `/meter` directly.
5. Keep the app's own login/paywall for `status === 'standalone'`.
6. Fixed-price actions: `confirmCharge({ credits, reason })` in the browser, then `mythos.charge(req, { credits, reason })` on the server after approval.
7. LLM calls are usage-based: `confirmCharge({ kind: 'llm', reason })` with no credits, then `mythos.llm(req, …)` + `mythos.billing(completion)`.
8. Map every `MythosError` to `err.httpStatus` (Python: `err.http_status`) and `err.code`.
9. Express/FastAPI do not load `.env` automatically: start with `node --env-file=.env server.js` or `uvicorn main:app --env-file .env`.
10. Run `npx @mythos-work/sdk doctor` (Python: `python -m mythos_sdk doctor`) until every ✖ is fixed.

## Deployment environment (0.5.0)

```dotenv
# openssl rand -base64 32  (>= 32 chars)
MYTHOS_SESSION_SECRET=
# Mythos dashboard → Settings → Mythos key
MYTHOS_KEY=
```

Copy the current Producer key into the server environment and redeploy after regeneration. Missing keys are a soft warning in 0.5.0 with auto-registration; static `MYTHOS_LISTING_ID(S)` launches without a key remain silent. `MYTHOS_KEY` will be required in 0.6.0. The bundled `AGENTS.md` defines the binding matrix, exact warning and mismatch responses.

| Troubleshooting code | Fix |
|---|---|
| `PRODUCER_MISMATCH` | The `MYTHOS_KEY` in this deployment belongs to a different Producer, or was regenerated. Copy the current key from the dashboard and redeploy. |
