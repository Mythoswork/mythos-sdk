import math
import re
from decimal import Decimal

from .errors import MythosError

_INVALID = 'usd must be a decimal string with at most 4 decimal places, e.g. "0.15"'


def normalize_usd(usd: object) -> str:
    numeric = False
    if isinstance(usd, bool):
        raise MythosError(_INVALID, "INVALID_CHARGE_AMOUNT", 400)
    if isinstance(usd, str):
        value = usd
    elif isinstance(usd, (int, float)):
        if (isinstance(usd, float) and not math.isfinite(usd)) or not 0 < usd <= 2**53 - 1:
            raise MythosError("usd must be a positive finite number within the safe integer limit", "INVALID_CHARGE_AMOUNT", 400)
        value = str(int(usd)) if isinstance(usd, float) and usd.is_integer() else repr(usd)
        numeric = True
    elif isinstance(usd, Decimal):
        if not usd.is_finite():
            raise MythosError(_INVALID, "INVALID_CHARGE_AMOUNT", 400)
        value = str(usd)
        numeric = True
    else:
        raise MythosError(_INVALID, "INVALID_CHARGE_AMOUNT", 400)
    try:
        assert_usd(value)
    except MythosError:
        if numeric:
            raise MythosError(f"usd {value} is not a plain decimal with at most 4 decimal places; round it first (e.g. round(x, 2)) or pass a string", "INVALID_CHARGE_AMOUNT", 400) from None
        raise
    return value


def assert_usd(usd: str) -> None:
    if not isinstance(usd, str) or re.fullmatch(r"[0-9]+(\.[0-9]{1,4})?", usd) is None:
        raise MythosError(_INVALID, "INVALID_CHARGE_AMOUNT", 400)
    if not any(char in "123456789" for char in usd):
        raise MythosError("usd must be greater than 0", "INVALID_CHARGE_AMOUNT", 400)
