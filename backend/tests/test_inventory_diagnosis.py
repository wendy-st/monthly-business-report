from decimal import Decimal

import pytest

from app.services.inventory_diagnosis import (
    LOCAL_SHORT,
    REDUNDANT,
    TOTAL_SHORT,
    inventory_diagnosis,
)


def values(shipping: str, order: str) -> dict[str, str | None]:
    return {
        "shipping_rate": shipping,
        "order_rate": order,
        "local_days": str(Decimal(shipping) * 50),
        "total_days": str(Decimal(order) * 100),
        "shipping_days": "50",
        "order_days": "100",
        "local_bound": "0",
        "total_bound": "0",
        "age270": "0",
    }


@pytest.mark.parametrize(
    ("shipping", "order", "redundant"),
    [
        ("1.5", "1.5", False),
        ("1.50001", "1.5", False),
        ("1.5", "1.50001", False),
        ("1.50001", "1.50001", True),
        ("2.9", "2.01", True),
        ("2.9", "1.2", False),
        ("0.93", "1.19", False),
    ],
)
def test_redundancy_requires_both_rates_strictly_above_150_percent(
    shipping: str, order: str, redundant: bool
) -> None:
    flags, text = inventory_diagnosis(values(shipping, order))
    assert (REDUNDANT in flags) is redundant
    if redundant:
        assert "库存冗余：两项满足率均超过150%" in text
    else:
        assert "整体库存正常" in text


def test_local_preparation_shortfall_does_not_make_adequate_total_stock_redundant() -> None:
    data = values("0.931372549019607843137254902", "1.186915887850467289719626168")
    data.update(local_days="47.5", shipping_days="51", total_days="127", order_days="107")
    flags, text = inventory_diagnosis(data)
    assert flags == [LOCAL_SHORT]
    assert "本地仓可覆盖47.5天，低于发货标准51天，缺口3.5天" in text
    assert "高于保底下单标准107天，超出20.0天" in text
    assert "整体库存正常，本地仓需关注发货准备" in text


def test_short_total_stock_reports_gap_and_aged_inventory_remains_separate() -> None:
    data = values("0.8", "0.9")
    data["age270"] = "5"
    flags, text = inventory_diagnosis(data)
    assert flags == [LOCAL_SHORT, TOTAL_SHORT, "存在270天以上库存"]
    assert "缺口10.0天" in text
    assert "需另外关注库龄" in text


def test_missing_rate_cannot_be_reported_as_normal_or_redundant() -> None:
    data = values("3", "2")
    data.update(shipping_rate=None, local_days=None)
    flags, text = inventory_diagnosis(data)
    assert flags == []
    assert "资料不足，库存状况待核查" in text
    assert "整体库存正常" not in text


def test_forecast_lower_bounds_are_not_presented_as_exact_values() -> None:
    data = values("2", "1.8")
    data.update(local_bound="1", total_bound="1")
    flags, text = inventory_diagnosis(data)
    assert REDUNDANT in flags
    assert "至少可覆盖100.0天" in text
    assert "满足率至少200.0%" in text
