from decimal import Decimal
from unittest.mock import Mock, patch

from app.schemas.reports import ReportFilter
from app.services.inventory_details import inventory_kpis
from app.services.inventory_report import add_turnover, stock_row, turnover_rows
from app.services.inventory_sources import InventoryFact, current_stock, inventory_dimensions
from app.services.inventory_styles import inventory_styles, style_name
from app.services.inventory_turnover import replace_current_stock
from app.services.report_dataset import ReportDataset
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


def test_new_object_ytd_uses_existing_months_when_source_periods_are_complete() -> None:
    rows = turnover_rows(
        [inventory("2026.9月", "120", "-80")],
        ReportFilter(),
        available_months={f"2026-{month:02}" for month in range(1, 10)},
    )
    cumulative = next(row for row in rows if row.key == "所有仓库|2026-YTD")
    assert Decimal(cumulative.values["days_qty"] or "0") == Decimal("409.5")


def test_confirmed_blank_sku_mapping_resolves_each_listed_msku() -> None:
    dataset = Mock(spec=ReportDataset)
    source = record(
        "全小组2026-09.xlsx",
        "待补充映射",
        6,
        {"站点": "US", "LISTING": "SP001", "MSKU": "Gift A；Gift B", "确认状态": "不适用"},
    )
    dataset.records.side_effect = lambda family: [source] if family == "style_mapping" else []
    inventory_styles.cache_clear()
    assert style_name(dataset, "US", "SP001", "", "Gift A") == "不适用"
    assert style_name(dataset, "US", "SP001", "", "Gift B") == "不适用"
    assert style_name(dataset, "US", "SP001", "", "Other") == ""
    inventory_styles.cache_clear()


def test_current_style_mapping_does_not_rewrite_historical_blank_style() -> None:
    dataset = Mock(spec=ReportDataset)
    dataset.external_group.return_value = ("A", "SOURCE_GROUP_FALLBACK")
    source = record(
        "全小组2026-09.xlsx",
        "自动匹配核对",
        6,
        {"站点": "US", "LISTING": "X", "SKU": "X 40", "已匹配款式": "X款式"},
    )
    dataset.records.side_effect = lambda family: [source] if family == "style_mapping" else []
    current = record(
        "库存.xlsx", "FBA", 2, {"年月": "2026.9月", "站点": "US", "LISTING": "X", "SKU": "X 40"}
    )
    historical = record("库存.xlsx", "FBA", 3, {**current.raw, "年月": "2026.8月"})
    assert inventory_dimensions(dataset, current)["style"] == "X款式"
    assert inventory_dimensions(dataset, historical)["style"] == ""
    inventory_styles.cache_clear()


def test_age_ratio_uses_whole_fba_denominator() -> None:
    first = inventory("2026.9月", "0", "0")
    second = inventory("2026.9月", "0", "0")
    first.amounts = {"in_stock": Decimal(20), "age180": Decimal(10), "age270": Decimal(0)}
    second.amounts = {"in_stock": Decimal(80), "age180": Decimal(0), "age270": Decimal(0)}
    result = stock_row([first, second], "A", {"group": "A"})
    assert Decimal(result.values["age180_rate"] or "0") == Decimal("0.1")


def test_abnormal_fba_records_are_excluded_from_all_current_stock_amounts() -> None:
    dataset = Mock(spec=ReportDataset)
    dataset.records.return_value = [
        record(
            "source.xlsx",
            "库存数据",
            i + 2,
            {
                "年月": "2026-09",
                "所属仓": warehouse,
                "同步状态": status,
                "总库存": qty,
                "总采购成本": qty,
                "总头程成本": "0",
                "在库量": qty,
                "271~330": "0",
                "331~365": "0",
                "365+": "0",
            },
        )
        for i, (warehouse, status, qty) in enumerate(
            [
                ("FBA仓", "异常", "999"),
                ("FBA仓", "正常", "10"),
                ("本地仓", "异常", "20"),
                ("海外仓", "正常", "30"),
            ]
        )
    ]
    with patch("app.services.inventory_sources.inventory_dimensions") as dimensions:
        dimensions.side_effect = lambda _, source: {"warehouse": source.raw["所属仓"]}
        stocks = current_stock(dataset, ReportFilter())
    assert len(stocks) == 3
    assert all(item.source.row != 2 for item in stocks)
    result = stock_row(stocks, "all", {})
    assert result.values["quantity"] == "60"
    assert result.values["amount"] == "60"
    assert result.values["in_stock"] == "10"


def stock_fact(
    month: str, quantity: str, *, sku: str = "X", warehouse: str = "FBA仓"
) -> InventoryFact:
    item = inventory(month, "0", "0")
    item.dimensions.update(warehouse=warehouse, sku=sku, msku=sku)
    for suffix in ("qty", "purchase", "amount"):
        item.amounts[f"end_{suffix}"] = Decimal(quantity)
    return item


def operating_stock(quantity: str, *, sku: str = "X", warehouse: str = "FBA仓") -> InventoryFact:
    item = stock_fact("2026.9月", quantity, sku=sku, warehouse=warehouse)
    item.amounts = {key: Decimal(quantity) for key in ("quantity", "purchase", "amount")}
    return item


def test_replacement_uses_previous_base_and_operating_ending() -> None:
    previous = stock_fact("2026.8月", "100")
    current = stock_fact("2026.9月", "999")
    for suffix in ("qty", "purchase", "amount"):
        current.amounts[f"flow_{suffix}"] = Decimal(-20)
    facts = replace_current_stock([previous, current], [operating_stock("60")])
    rows = turnover_rows(facts, ReportFilter())
    current_row = next(row for row in rows if row.key == "所有仓库|2026-09")
    assert current_row.values["begin_qty"] == "100"
    assert current_row.values["end_qty"] == "60"
    assert current_row.values["days_qty"] == "120"


def test_replacement_removes_whole_scope_and_preserves_sold_out_flow() -> None:
    sold = stock_fact("2026.9月", "900", sku="sold")
    sold.amounts["flow_qty"] = Decimal(-30)
    local = stock_fact("2026.9月", "40", warehouse="本地仓")
    rows = turnover_rows(
        replace_current_stock([sold, local], [operating_stock("60")]), ReportFilter()
    )
    row = next(row for row in rows if row.key == "所有仓库|2026-09")
    assert row.values["end_qty"] == "100"
    assert row.values["flow_qty"] == "-30"


def test_duplicate_current_rows_take_beginning_only_once() -> None:
    previous = stock_fact("2026.8月", "100")
    current = [operating_stock("20"), operating_stock("30")]
    rows = turnover_rows(replace_current_stock([previous], current), ReportFilter())
    row = next(row for row in rows if row.key == "所有仓库|2026-09")
    assert row.values["begin_qty"] == "100"
    assert row.values["end_qty"] == "50"
    assert row.values["average_qty"] == "75"


def test_inventory_kpis_compare_days_and_stock_rates_separately() -> None:
    facts = [stock_fact("2026.8月", "100"), stock_fact("2026.9月", "120")]
    kpis = inventory_kpis(turnover_rows(facts, ReportFilter()))
    assert kpis[1].mom == "0.2"
    assert kpis[1].year_ago is None


def test_season_reference_outside_window_stays_unavailable() -> None:
    from unittest.mock import patch

    from app.schemas.inventory import FutureRow
    from app.services.report_dataset import ReportDataset
    from app.services.seasonal_risk import seasonal_risk

    future = [
        FutureRow(
            month="2026-10",
            scope="FBA+海外仓",
            scenario="基础",
            demand="1000",
            remaining="0",
            support_days="15",
            calendar_days=31,
        )
    ]
    with (
        patch("app.services.seasonal_risk.all_readiness", return_value=[]),
        patch(
            "app.services.seasonal_risk.season_context",
            return_value=("淡季", "2026-04", "2026-08", "2026-06"),
        ),
    ):
        dataset = Mock(spec=ReportDataset)
        dataset.manifest = {"report_month": "2026-09"}
        result = seasonal_risk(
            dataset,
            ReportFilter(),
            {"quantity": "500", "amount": "50000"},
            future,
            {"2026-09": {"days_qty": "200"}},
        )
    assert result.phase == "淡季"
    assert result.season_end_remaining_rate is None
    assert result.window_end_remaining_rate == "0"
    assert result.score == 0
