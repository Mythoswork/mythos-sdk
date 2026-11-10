from decimal import Decimal

import pytest

from mythos_sdk import MythosError
from mythos_sdk.usd import normalize_usd


@pytest.mark.parametrize("value,expected", [(0.15, "0.15"), ("0.15", "0.15"), (1, "1"), (1.0, "1"), (Decimal("0.15"), "0.15"), ("0000.1500", "0000.1500")])
def test_normalize_usd(value, expected):
    assert normalize_usd(value) == expected


@pytest.mark.parametrize("value", [0.1 + 0.2, float("nan"), float("inf"), float("-inf"), True, False, None, {}, -1, 0, 1e-7, 2**53, Decimal("NaN"), Decimal("Infinity")])
def test_normalize_usd_rejects(value):
    with pytest.raises(MythosError) as error:
        normalize_usd(value)
    assert error.value.code == "INVALID_CHARGE_AMOUNT"
    assert error.value.http_status == 400


def test_computed_float_hint():
    with pytest.raises(MythosError, match=r"round\(x, 2\)"):
        normalize_usd(0.1 + 0.2)
