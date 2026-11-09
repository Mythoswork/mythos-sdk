import re

from .errors import MythosError

_INVALID = 'usd must be a decimal string with at most 4 decimal places, e.g. "0.15"'


def assert_usd(usd: str) -> None:
    if not isinstance(usd, str) or re.fullmatch(r"[0-9]+(\.[0-9]{1,4})?", usd) is None:
        raise MythosError(_INVALID, "INVALID_CHARGE_AMOUNT", 400)
    if not any(char in "123456789" for char in usd):
        raise MythosError("usd must be greater than 0", "INVALID_CHARGE_AMOUNT", 400)
