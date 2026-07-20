# Quickstart: Python

Wire the Mythos SDK into a FastAPI app in under 10 minutes.

{% hint style="info" %}
**Prerequisites:** [Install the SDK](install.md) and set `MYTHOS_LISTING_ID` in `.env`.
{% endhint %}

## 1. Install

```bash
pip install "mythos-sdk[fastapi]" uvicorn
```

## 2. Server routes

```python
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from mythos_sdk import (
    MythosError,
    MythosSession,
    handshake_router,
    report_usage,
    require_launch_token,
)

app = FastAPI()
app.include_router(handshake_router)


@app.get("/api/mythos/session")
async def mythos_session(session: MythosSession = Depends(require_launch_token())):
    return {
        "userId": session.userId,
        "email": session.email,
        "displayName": session.displayName,
        "listingId": session.listingId,
        "sessionJti": session.sessionJti,
    }


class ReportUsageRequest(BaseModel):
    session_jti: str
    credits: int = 1
    reason: str | None = None


@app.post("/api/mythos/report-usage")
async def mythos_report_usage(request: ReportUsageRequest):
    try:
        await report_usage(request.session_jti, request.credits, request.reason)
    except MythosError as e:
        raise HTTPException(status_code=402, detail=str(e)) from e
    return {"success": True}
```

{% hint style="warning" %}
`require_launch_token` is a **factory** — use `Depends(require_launch_token())` with parentheses. `MythosSession` fields are camelCase (`session.sessionJti`, not `session_jti`).
{% endhint %}

## 3. Run

```bash
uvicorn main:app --port 8080 --reload
```

Do not use `python main.py` unless your app explicitly starts uvicorn that way.

## 4. Frontend (minimal)

Same pattern as Node — call `/api/mythos/session?lt=`, strip `lt` from URL, store `sessionJti`. The Python session endpoint above returns a flat JSON object (no `{ session: ... }` wrapper); your frontend client must match. See [Frontend client](../guides/frontend-client.md).

## 5. Verify

```bash
curl.exe -i http://127.0.0.1:8080/.well-known/mythos-handshake
# → 401 {"error":"Missing launch token"}
```

More checks: [Verify your integration](verify-integration.md).

## What you built

| Route | Purpose |
|-------|---------|
| `GET /.well-known/mythos-handshake?lt=` | Publish gate |
| `GET /api/mythos/session?lt=` | Verify + consume launch token |
| `POST /api/mythos/report-usage` | Debit Consumer wallet |

## Next steps

- [FastAPI guide](../guides/fastapi.md) — router module, listing callback
- [What to watch out for](../guides/watch-out-for.md) — real gotchas before you ship
- [AI integration prompt](../guides/ai-integration-prompt.md) — full agent brief
- [Mock Python app](../resources/mock-integration-apps.md) — end-to-end harness
