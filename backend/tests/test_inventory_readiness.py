from decimal import Decimal

from app.services.inventory_forecast import consume_month, covered_days
from app.services.inventory_readiness import assess_sku, readiness_summary
from app.services.inventory_sources import InventoryFact
from app.services.shipping_standards import StandardKey, average_standard, find_standard
from app.services.source_import import record
from app.services.workbook_reader import RawRow


def stock(quantity: str, warehouse: str, *, available: str | None = None) -> InventoryFact:
    source = record("source.xlsx", "库存数据", 2, {"可用量": available})
    return InventoryFact(
        {"warehouse": warehouse},
        {
            "quantity": Decimal(quantity),
            "in_stock": Decimal(quantity),
            "age270": Decimal(5 if warehouse == "FBA仓" else 100),
        },
        source,
    )


DIMS = {"group": "Ash", "site": "CA", "listing": "X", "sku": "X 40", "style": "X款"}
FORECAST: dict[str, Decimal | None] = {
    "2026-10": Decimal(310),
    "2026-11": Decimal(300),
    "2026-12": Decimal(310),
}
STANDARD: RawRow = {"总发货天数": "50", "运营保底下单天数": "75"}


def test_days_follow_same_monthly_consumption_as_support_chart() -> None:
    forecast: dict[str, Decimal | None] = {
        "2026-10": Decimal(0),
        "2026-11": Decimal(600),
        "2026-12": Decimal(310),
    }
    days, bound = covered_days(Decimal(300), forecast)
    supported, remaining = consume_month(Decimal(300), Decimal(600), 30)
    assert supported == 15 and remaining == 0
    assert days == 31 + supported and bound is False


def test_two_rates_use_local_available_and_all_warehouses_without_netting() -> None:
    rows = [stock("700", "本地仓", available="600"), stock("150", "FBA仓"), stock("50", "海外仓")]
    result = assess_sku(DIMS, rows, FORECAST, STANDARD, "SKU")
    assert Decimal(result.values["local_days"] or "0") == 60
    assert Decimal(result.values["total_days"] or "0") == 90
    assert Decimal(result.values["shipping_rate"] or "0") == Decimal("1.2")
    assert Decimal(result.values["order_rate"] or "0") == Decimal("1.2")
    assert Decimal(result.values["coverage"] or "0") == Decimal(200) / 920
    assert Decimal(result.values["age270_rate"] or "0") == Decimal(5) / 150
    assert result.values["age270"] == "5"  # 海外仓及本地仓库龄不混入FBA。
    assert result.dimensions["issues"] == "存在270天以上库存"
    assert "整体库存正常" in result.dimensions["diagnosis"]


def test_window_end_is_lower_bound_and_unknown_standard_is_not_shortage() -> None:
    result = assess_sku(
        DIMS,
        [stock("2000", "本地仓", available="2000")],
        FORECAST,
        {"总发货天数": "100", "运营保底下单天数": "75"},
        "SKU",
    )
    assert result.values["local_bound"] == "1"
    assert result.values["shipping_rate"] is None
    assert "本地仓覆盖天数低于发货标准" not in result.dimensions["issues"]
    assert Decimal(result.values["order_rate"] or "0") > 1


def test_missing_zero_standards_and_missing_available_are_distinct() -> None:
    result = assess_sku(
        DIMS,
        [stock("100", "本地仓")],
        FORECAST,
        {"总发货天数": "50", "运营保底下单天数": "0"},
        "SKU",
    )
    assert result.values["shipping_rate"] is None
    assert result.values["order_rate"] is None
    assert "缺少本地仓可用量" in result.dimensions["notes"]
    assert "保底下单标准为零或负数" in result.dimensions["notes"]
    missing = assess_sku(DIMS, [], {}, {}, "缺少发货标准")
    assert missing.values["shipping_days"] is None
    assert "缺少发货标准" in missing.dimensions["notes"]
    assert "缺少销量预测" in missing.dimensions["notes"]


def test_stock_surplus_cannot_cancel_another_skus_shortage_in_rollup() -> None:
    first = assess_sku(DIMS, [stock("100", "本地仓", available="100")], FORECAST, STANDARD, "SKU")
    second = assess_sku(
        {**DIMS, "sku": "X 41"},
        [stock("800", "本地仓", available="800")],
        FORECAST,
        STANDARD,
        "SKU",
    )
    values, issues = readiness_summary([first, second])
    assert values["shipping_short"] == "1"
    assert values["redundant_skus"] == "0"
    assert Decimal(values["shipping_rate_min"] or "0") == Decimal("0.2")
    assert Decimal(values["shipping_rate_max"] or "0") == Decimal("1.6")
    assert "本地仓覆盖天数低于发货标准：1个SKU" in issues


def test_specific_sku_standard_wins_and_conflicting_fallback_is_unavailable() -> None:
    index: dict[StandardKey, list[RawRow]] = {
        ("Ash", "CA", "X", "sku:X 40"): [STANDARD],
        ("Ash", "CA", "X", "style:X款"): [STANDARD, {**STANDARD, "总发货天数": "75"}],
    }
    assert find_standard(index, DIMS) == (STANDARD, "SKU")
    assert find_standard(index, {**DIMS, "sku": "X 41"}) == ({}, "发货标准冲突")


def test_missing_prediction_is_not_zero() -> None:
    assert covered_days(Decimal(100), {"2026-10": None, "2026-11": Decimal(10)}) == (None, False)
    assert covered_days(Decimal(100), {"2026-10": Decimal(0)}) == (None, False)


def test_coverage_uses_same_effective_window_as_future_chart() -> None:
    result = assess_sku(
        DIMS, [stock("100", "FBA仓")], {"2026-10": Decimal(100), "2026-11": None}, STANDARD, "SKU"
    )
    assert result.values["coverage"] == "1"
    assert result.values["abroad_days"] == "31"


def test_average_standard_counts_unique_skus_and_rounds_up() -> None:
    rows: list[RawRow] = [
        {
            "积加SKU": f"{style}-{i}",
            "产品款式": style,
            "总发货天数": days,
            "运营保底下单天数": minimum,
        }
        for style, count, days, minimum in [
            ("A", 270, "50", "80"),
            ("B", 36, "55", "90"),
            ("C", 18, "50", "80"),
        ]
        for i in range(count)
    ]
    index: dict[StandardKey, list[RawRow]] = {("Ash", "CA", "X", "listing:X"): rows + [rows[0]]}
    value, count = average_standard(index, {**DIMS, "style": ""})
    assert count == 324
    assert value == {"总发货天数": "51", "运营保底下单天数": "82"}
    for row in rows[-18:]:
        row["总发货天数"] = "60"
    assert average_standard(index, {**DIMS, "style": ""})[0]["总发货天数"] == "52"
    assert average_standard(index, {**DIMS, "style": "B"}) == (
        {"总发货天数": "55", "运营保底下单天数": "90"},
        36,
    )


def test_average_standard_ignores_blank_but_retains_conflicting_sku_standards() -> None:
    rows: list[RawRow] = [
        {"积加SKU": "A", "总发货天数": "50", "运营保底下单天数": "80"},
        {"积加SKU": "B", "总发货天数": "60", "运营保底下单天数": None},
    ]
    index: dict[StandardKey, list[RawRow]] = {("Ash", "CA", "X", "listing:X"): rows}
    value, count = average_standard(index, {**DIMS, "style": ""})
    assert count == 2 and value == {"总发货天数": "55", "运营保底下单天数": "80"}
    rows.append({**rows[0], "总发货天数": "55"})
    assert average_standard(index, {**DIMS, "style": ""})[0]["总发货天数"] is None


def test_average_standard_uses_independent_nonblank_samples_for_each_field() -> None:
    rows: list[RawRow] = [
        {"积加SKU": "A", "产品款式": "A款", "总发货天数": "50", "运营保底下单天数": "110"},
        {"积加SKU": "A", "产品款式": "A款", "总发货天数": "", "运营保底下单天数": None},
        {"积加SKU": "B", "产品款式": "A款", "总发货天数": "60", "运营保底下单天数": " "},
        {"积加SKU": "C", "产品款式": "B款", "总发货天数": None, "运营保底下单天数": "120"},
    ]
    index: dict[StandardKey, list[RawRow]] = {("Ash", "CA", "X", "listing:X"): rows}
    assert average_standard(index, {**DIMS, "style": ""}) == (
        {"总发货天数": "55", "运营保底下单天数": "115"},
        3,
    )
    assert average_standard(index, {**DIMS, "style": "A款"}) == (
        {"总发货天数": "55", "运营保底下单天数": "110"},
        2,
    )
    assert average_standard(index, {**DIMS, "style": "B款"}) == (
        {"总发货天数": None, "运营保底下单天数": "120"},
        1,
    )
    for row in rows:
        row["运营保底下单天数"] = ""
    assert average_standard(index, {**DIMS, "style": ""})[0]["运营保底下单天数"] is None
