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
MYTHOS_SESSION_SECRET=                     # openssl rand -base64 32  (≥ 32 chars)
```
uvicorn does not read `.env` on its own — step 5 starts it with `--env-file`. In production, set these in your host's environment instead.

## 3. Server
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
        await mythos.charge(request, credits=1, reason="calculate")
        return {"success": True, "data": {"result": body["a"] + body["b"]}}
    except MythosError as err:
        return JSONResponse({"success": False, "error": str(err), "code": err.code}, status_code=err.http_status)
```
Defining `mythos = create_mythos()` directly in `main.py` is equivalent.

## 4. Page
```html
<button onclick="calculate()">Calculate (1 credit)</button>
<script src="https://cdn.jsdelivr.net/npm/@mythos-work/sdk@0.3.0/dist/mythos-client.global.js"></script>
<script>
  const m = Mythos.initMythos();
  m.ready.then((s) => { document.body.dataset.mythos = s.status; });
  async function calculate() {
    const { approved } = await m.confirmCharge({ credits: 1, reason: '1 + 2' });
    if (approved) await m.fetch('/api/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1, b: 2 }) });
  }
</script>
```

## 5. Run and check it
```bash
uvicorn main:app --env-file .env
python -m mythos_sdk doctor
```
Then launch your listing from the Mythos dashboard.
