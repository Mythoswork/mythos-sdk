import re

from .errors import MythosError

# Mirrors the Mythos backend rate (CREDITS_PER_CENT = 100, i.e. 1 credit = $0.0001). Credits are a fixed unit;
# if the backend ever changes it, update this, billing.constants.ts and conformance/usd-credits-v1.json together.
CREDITS_PER_USD = 10_000
_MAX_CREDITS = 9_007_199_254_740_991
_INVALID = 'usd must be a decimal string with at most 4 decimal places, e.g. "0.15"'


def usd_to_credits(usd: str) -> int:
    if not isinstance(usd, str) or re.fullmatch(r"[0-9]+(\.[0-9]{1,4})?", usd) is None:
        raise MythosError(_INVALID, "INVALID_CHARGE_AMOUNT", 400)
    whole, _, fraction = usd.partition(".")
    digits = (whole + fraction.ljust(len(str(CREDITS_PER_USD)) - 1, "0")).lstrip("0") or "0"
    if digits == "0":
        raise MythosError("usd must be greater than 0", "INVALID_CHARGE_AMOUNT", 400)
    max_digits = str(_MAX_CREDITS)
    if len(digits) > len(max_digits) or (len(digits) == len(max_digits) and digits > max_digits):
        raise MythosError(_INVALID, "INVALID_CHARGE_AMOUNT", 400)
    return int(digits)
