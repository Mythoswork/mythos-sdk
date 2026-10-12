from typing import Literal

DiagnosticCode = Literal[
    "CONFIG_ERROR", "PRODUCER_MISMATCH", "INVALID_LAUNCH_TOKEN", "LISTING_NOT_REGISTERED",
    "TOKEN_ALREADY_CONSUMED", "SESSION_EXPIRED", "MYTHOS_UNREACHABLE", "UPSTREAM_ERROR",
    "SESSION_REQUIRED", "INSUFFICIENT_FUNDS",
]
DiagnosticStep = Literal["verify_launch", "consume", "session", "meter", "llm"]
DIAGNOSTIC_TIMEOUT_SECONDS = 2.0
DIAGNOSTIC_MESSAGES: dict[DiagnosticCode, str] = {
    "CONFIG_ERROR": "The app's Mythos SDK is misconfigured. Check MYTHOS_SESSION_SECRET and MYTHOS_KEY.",
    "PRODUCER_MISMATCH": "MYTHOS_KEY belongs to a different Mythos account or was regenerated.",
    "INVALID_LAUNCH_TOKEN": "The app rejected the launch token. Check MYTHOS_API_URL points at this Mythos environment.",
    "LISTING_NOT_REGISTERED": "This listing isn't registered with the app yet. Save the listing again or set MYTHOS_LISTING_ID.",
    "TOKEN_ALREADY_CONSUMED": "The launch token was used twice. Reload to start a new test launch.",
    "SESSION_EXPIRED": "The test session expired. Start a new test launch.",
    "MYTHOS_UNREACHABLE": "The app couldn't reach Mythos. Check its network access and MYTHOS_API_URL.",
    "UPSTREAM_ERROR": "Mythos returned an unexpected error. Try again.",
    "SESSION_REQUIRED": "The app called charge() or llm() without a Mythos session.",
    "INSUFFICIENT_FUNDS": "Charge failed for funds. This shouldn't happen in a test launch; report it.",
}
