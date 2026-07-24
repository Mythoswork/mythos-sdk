# FastAPI

Full FastAPI integration guide for the Mythos SDK.

## Install

```bash
pip install "mythos-sdk[fastapi]" uvicorn
```

## Router module

Create `routers/mythos.py`:

```python
from fastapi import APIRouter, Depends, HTTPException
from mythos_sdk import (
    MythosError,
    MythosSession,
    create_listing_callback_handler,
    handshake_router,
    report_usage,
    require_launch_token,
)
from pydantic import BaseModel

router = APIRouter()
router.include_router(handshake_router)

listing_ids: list[str] = []

async def add_listing_id(listing_id: str) -> None:
    if listing_id not in listing_ids:
        listing_ids.append(listing_id)

async def get_listing_ids() -> list[str]:
    return listing_ids

router.add_api_route(
    "/.well-known/mythos-listing-registered",
    create_listing_callback_handler(add_listing_id),
    methods=["GET", "POST"],
)


class MythosSessionResponse(BaseModel):
    userId: str
    email: str
    displayName: str
    listingId: str
    sessionJti: str


@router.get("/api/mythos/session", response_model=MythosSessionResponse)
async def mythos_session(
    session: MythosSession = Depends(require_launch_token(resolve_listing_ids=get_listing_ids)),
) -> MythosSessionResponse:
    return MythosSessionResponse(
        userId=session.userId,
        email=session.email,
        displayName=session.displayName,
        listingId=session.listingId,
        sessionJti=session.sessionJti,
    )


class ReportUsageRequest(BaseModel):
    session_jti: str
    credits: int = 1
    reason: str | None = None


@router.post("/api/mythos/report-usage")
async def mythos_report_usage(request: ReportUsageRequest) -> dict[str, bool]:
    try:
        await report_usage(request.session_jti, request.credits, request.reason)
    except MythosError as e:
        raise HTTPException(status_code=402, detail=str(e)) from e
    return {"success": True}
```

## Mount in main.py

```python
from fastapi import FastAPI
from routers import mythos

app = FastAPI()
app.include_router(mythos.router)
```

## Run

```bash
uvicorn main:app --port 8080 --reload
```

:::warning
Use `Depends(require_launch_token())` or `Depends(require_launch_token(resolve_listing_ids=...))` — always call the factory. Access `session.sessionJti` (camelCase).
:::

## Environment

```env
MYTHOS_LISTING_ID=<listing-id>
```

## Next steps

- [Dynamic listing IDs](../concepts/dynamic-listing-ids.md)
- [Mock Python app](../resources/mock-integration-apps.md)
- [Verify your integration](../getting-started/verify-integration.md)
