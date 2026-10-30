from decimal import Decimal

from app.schemas.reports import ReportFilter
from app.services.inventory_report import add_turnover, stock_row, turnover_rows
from app.services.inventory_sources import InventoryFact
from app.services.source_import import record


def inventory(month: str, average: str, flow: str) -> InventoryFact:
    source = record("synthetic.xlsx", "测试源", 2, {"年月": month})
    return InventoryFact(
        {
            "group": "A",
            "site": "US",
            "listing": "X",
            "category1": "C",
            "category2": "C2",
            "category3": "C3",
            "month": source.period,
            "warehouse": "FBA仓",
        },
        {
            **{f"average_{key}": Decimal(average) for key in ("qty", "purchase", "amount")},
            **{f"flow_{key}": Decimal(flow) for key in ("qty", "purchase", "amount")},
        },
        source,
    )


def test_signed_flow_aggregates_before_absolute_value() -> None:
    rows = turnover_rows(
        [inventory("2026.9月", "100", "-100"), inventory("2026.9月", "20", "20")], ReportFilter()
    )
    september = next(row for row in rows if row.key == "所有仓库|2026-09")
    assert Decimal(september.values["days_qty"] or "0") == 45


def test_ytd_uses_monthly_average_and_calendar_days() -> None:
    facts = [inventory(f"2026.{month}月", "120", "-80") for month in range(1, 10)]
    rows = turnover_rows(facts, ReportFilter())
    cumulative = next(row for row in rows if row.key == "所有仓库|2026-YTD")
    assert Decimal(cumulative.values["days_qty"] or "0") == Decimal("45.5")


def test_missing_ytd_month_stays_unavailable() -> None:
    rows = turnover_rows([inventory("2026.9月", "120", "-80")], ReportFilter())
    cumulative = next(row for row in rows if row.key == "所有仓库|2026-YTD")
    assert cumulative.values["days_qty"] is None
    assert (
        add_turnover({"average_qty": Decimal(10), "flow_qty": Decimal(0)}, 30)["days_qty"] is None
    )


def test_age_ratio_uses_whole_fba_denominator() -> None:
    first = inventory("2026.9月", "0", "0")
    second = inventory("2026.9月", "0", "0")
    first.amounts = {"in_stock": Decimal(20), "age180": Decimal(10), "age270": Decimal(0)}
    second.amounts = {"in_stock": Decimal(80), "age180": Decimal(0), "age270": Decimal(0)}
    result = stock_row([first, second], "A", {"group": "A"})
    assert Decimal(result.values["age180_rate"] or "0") == Decimal("0.1")
