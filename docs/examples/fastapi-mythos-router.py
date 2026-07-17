"""Mythos SDK router for FastAPI — copy into your app's routers/ directory.

Mount in main.py:
    from routers import mythos
    app.include_router(mythos.router)

Env required (unless using resolve_listing_ids):
    MYTHOS_LISTING_ID=<your-listing-id>
"""
from fastapi import APIRouter, Depends, HTTPException
from mythos_sdk import MythosError, MythosSession, handshake_router, report_usage, require_launch_token
from pydantic import BaseModel

router = APIRouter()
router.include_router(handshake_router)

# Optional: dynamic listing IDs via listing callback
# from mythos_sdk import create_listing_callback_handler
#
# listing_ids: list[str] = []
#
# async def add_listing_id(listing_id: str) -> None:
#     if listing_id not in listing_ids:
#         listing_ids.append(listing_id)
#
# async def get_listing_ids() -> list[str]:
#     return listing_ids
#
# router.add_api_route(
#     "/.well-known/mythos-listing-registered",
#     create_listing_callback_handler(add_listing_id),
#     methods=["GET", "POST"],
# )


class MythosSessionResponse(BaseModel):
    userId: str
    email: str
    displayName: str
    listingId: str
    sessionJti: str


@router.get("/api/mythos/session", response_model=MythosSessionResponse)
async def mythos_session(
    session: MythosSession = Depends(require_launch_token()),
) -> MythosSessionResponse:
    """Verify + single-use-consume the launch token; return session to frontend."""
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
    """Debit the Mythos wallet after a billable action."""
    try:
        await report_usage(request.session_jti, request.credits, request.reason)
    except MythosError as e:
        raise HTTPException(status_code=402, detail=str(e)) from e
    return {"success": True}
