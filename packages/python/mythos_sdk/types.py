from dataclasses import dataclass


@dataclass
class MythosSession:
    userId: str
    email: str
    displayName: str
    listingId: str
    sessionJti: str
    llmIdentityToken: str | None = None
    llmIdentityExpiresAt: str | None = None
