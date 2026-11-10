---
title: Quickstart — FastAPI
sidebar_label: FastAPI
---

Zero to a billed charge in 5 steps.

## 1. Install
```bash
pip install "mythos-sdk[fastapi,llm]" "fastapi[standard]"
npx @mythos-work/sdk init
```

## 2. Environment
```bash
# .env
MYTHOS_LISTING_ID=your-listing-id
# openssl rand -base64 32  (≥ 32 chars)
MYTHOS_SESSION_SECRET=
# Mythos dashboard → Settings → Mythos key
MYTHOS_KEY=
```
uvicorn does not read `.env` on its own — step 5 starts it with `--env-file`. In production, set these in your host's environment instead.

## 3. Server
Missing `MYTHOS_KEY` is soft; static listing launches remain silent, while dynamic registration, handshake and callbacks warn once per process. It will be required in a future release. Update deployment env after key regeneration. See the [binding matrix](../reference/configuration.md).

| Troubleshooting code | Fix |
|---|---|
| `PRODUCER_MISMATCH` | The `MYTHOS_KEY` in this deployment belongs to a different Producer, or was regenerated. Copy the current key from the dashboard and redeploy. |

`init` created `mythos_setup.py` (`mythos = create_mythos()`); import it in `main.py`:
```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from mythos_sdk import MythosError
from mythos_setup import mythos

app = FastAPI()
app.include_router(mythos.router)

@app.post("/api/calculate")
async def calculate(request: Request):
    body = await request.json()
    try:
        await mythos.charge(request, usd=0.15, reason="calculate", consent_id=body.get("consentId"))
        return {"success": True, "data": {"result": body["a"] + body["b"]}}
    except MythosError as err:
        return JSONResponse({"success": False, "error": str(err), "code": err.code}, status_code=err.http_status)
```
Defining `mythos = create_mythos()` directly in `main.py` is equivalent.

## 4. Page
```html
<button onclick="calculate()">Calculate ($0.15)</button>
<script src="https://cdn.jsdelivr.net/npm/@mythos-work/sdk@0.6.0/dist/mythos-client.global.js"></script>
<script>
  const m = Mythos.initMythos();
  m.ready.then((s) => { document.body.dataset.mythos = s.status; });
  async function calculate() {
    const { approved, consentId } = await m.confirmCharge({ usd: 0.15, reason: 'calculate' });
    if (approved) await m.fetch('/api/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1, b: 2, consentId }) });
  }
</script>
```

The popup shows credits using the session rate; the server charges the same USD amount. Alternatively, use `credits=1500` directly (browser: `credits: 1500`). Python USD accepts numbers, exact decimal strings or `Decimal`; see [USD confirmation](./browser-client.md#confirm-a-usd-charge) for validation and missing-rate errors.

## 5. Run and check it
```bash
uvicorn main:app --env-file .env
python -m mythos_sdk doctor
```
Then launch your listing from the Mythos dashboard.
