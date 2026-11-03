"""逐LISTING问题须保持有符号归因、站点隔离和停运范围。"""

from decimal import Decimal
from unittest.mock import patch

from app.schemas.inventory import InventoryRow
from app.schemas.listing import ListingIssue, select_issues
from app.schemas.reports import ReportFilter
from app.services.cost_analysis import analyses
from app.services.financial_model import financials, number
from app.services.financial_report import breakdown
from app.services.inventory_sources import InventoryFact
from app.services.listing_financial_issues import (
    attribution_issue,
    cost_issue,
    profit_issue,
    retired_profit_issues,
)
from app.services.listing_inventory_issues import cleanup_issue, inventory_issues
from app.services.listing_report import ListingView, listing_mode, listing_view
from app.services.report_dataset import OperatingFact, ReportDataset
from tests.test_business_report import dataset, record
from tests.test_financial_model import sample


def test_profit_decline_explains_signed_waterfall_and_margin() -> None:
    data = dataset()
    data.operating = [
        OperatingFact(source, financials(source.raw), "SOURCE_PERIOD_GROUP")
        for source in [
            record("2026-09", "US", "X", 销售金额="800", 销售成本="300", 广告费="-200"),
            record("2026-08", "US", "X", 销售金额="1000", 销售成本="200", 广告费="-100"),
        ]
    ]
    row = breakdown(data.operating, "listings")[0]
    issue = profit_issue(row)
    assert issue.status == "关注"
    assert "环比净利-0.04万元" in issue.detail
    assert "收入变化-0.02万元" in issue.detail
    assert "净利率-32.50pp" in issue.detail
    assert "同比利润缺少可比数据" in issue.detail


def test_cost_rollback_is_not_misreported_as_increased_expense() -> None:
    data = dataset()
    data.operating = [
        OperatingFact(source, financials(source.raw), "SOURCE_PERIOD_GROUP")
        for source in [
            record("2026-09", "US", "X", 销售数量="10", 销售金额="1000", 广告费="100"),
            record("2026-08", "US", "X", 销售数量="10", 销售金额="1000", 广告费="-100"),
        ]
    ]
    issue = cost_issue(analyses(data, ReportFilter(group="LZF", site="US", listing="X")))
    assert issue.status != "关注"
    assert "营销推广负担率上升" not in issue.detail


def test_three_basis_attribution_uses_existing_margin_results() -> None:
    data = dataset()
    items = analyses(data, ReportFilter(group="LZF", site="US", listing="同名"))
    issue = attribution_issue(items)
    for item in items:
        left, right = number(item.current.get("margin")), number(item.base.get("margin"))
        assert left is not None and right is not None
        assert f"{(left - right) * 100:+.2f}pp" in issue.detail
    assert "实际→剔价→剔价剔退款" in issue.detail


def test_missing_period_and_nonpositive_revenue_are_not_normal_or_growth() -> None:
    data = dataset()
    data.operating = [
        OperatingFact(record("2026-09", "US", "X"), financials(sample()), "SOURCE_PERIOD_GROUP")
    ]
    row = breakdown(data.operating, "listings")[0]
    items = analyses(data, ReportFilter())
    assert profit_issue(row).status == "待核查"
    assert attribution_issue(items).status == "待核查"


def test_healthy_findings_are_explicit_and_inventory_is_retained() -> None:
    candidates = [
        ListingIssue(key=key, title=key, detail="已核查", status="未见异常")
        for key in ("sales", "profit", "cost", "attribution", "inventory")
    ]
    result = select_issues(candidates)
    assert {issue.key for issue in result} == {"sales", "profit", "inventory"}
    assert all(issue.status == "未见异常" for issue in result)
    candidates[3].status = "关注"
    assert candidates[3] in select_issues(candidates)


def test_retired_profit_reports_refund_and_storage_erosion_only() -> None:
    source = record("2026-09", "US", "X", 销售金额="0", 退货金额="-100", 基本月度仓储费="-30")
    row = breakdown(
        [OperatingFact(source, financials(source.raw), "SOURCE_PERIOD_GROUP")], "listings"
    )[0]
    issues = retired_profit_issues(row)
    assert {issue.key for issue in issues} == {"erosion", "erosion_cost"}
    assert "-0.01万元" in issues[0].detail
    assert "退款" in issues[1].detail and "FBA仓储" in issues[1].detail
    assert listing_mode("Ash", "UK", "RG810", "已停运") == "retired"


def test_inventory_uses_sku_flags_and_compares_turnover_without_invented_thresholds() -> None:
    stock = InventoryRow(
        key="X",
        label="X",
        dimensions={},
        source_rows=[],
        values={"quantity": "100", "amount": "1000", "age270": "10"},
    )
    sku = stock.model_copy(update={"dimensions": {"issues": "库存冗余", "notes": ""}})
    trend = [
        InventoryRow(
            key=month,
            label=month,
            source_rows=[],
            dimensions={"scope": "所有仓库", "month": month},
            values={"days_qty": days},
        )
        for month, days in (("2026-09", "120"), ("2026-08", "80"))
    ]
    issue = inventory_issues(stock, trend, [sku])[0]
    assert issue.status == "关注"
    assert "环比+40.0天" in issue.detail
    assert "库存冗余：1个SKU" in issue.detail
    assert "270天以上10件" in issue.detail
    assert cleanup_issue(stock).status == "关注"
    assert "待清库存100件" in cleanup_issue(stock).detail
    assert inventory_issues(stock.model_copy(update={"values": {}}), [], [])[0].status == "待核查"


def listing_result(
    data: ReportDataset, stocks: list[InventoryFact], group: str = "LZF"
) -> ListingView:
    with (
        patch("app.services.listing_report.shipping_identity", return_value="synthetic"),
        patch("app.services.listing_report.current_stock", return_value=stocks),
        patch("app.services.listing_report.all_readiness", return_value=[]),
        patch("app.services.listing_report.future_rows", return_value=([], [])),
        patch("app.services.listing_report.seasonal_risk") as seasonal,
    ):
        from app.schemas.inventory import SeasonalRisk

        seasonal.return_value = SeasonalRisk(
            phase="缺少季节资料",
            peak_month="",
            season_start="",
            season_end="",
            health="待核查",
            score=0,
            level="待补充",
            reasons=[],
            season_end_remaining_rate=None,
            window_end_remaining_rate=None,
        )
        return listing_view(data, ReportFilter(group=group), [])


def test_listing_scope_excludes_four_sites_and_keeps_same_listing_separate() -> None:
    data = dataset()
    position = record("2026-09", "US", "同名")
    position.raw = {"产品定位": "已停运"}
    data.cache["products"] = [position]
    report = listing_result(data, [])
    assert set(report.excluded_sites) == {"MX", "FR", "ES", "IT"}
    assert {item.site for item in report.items}.isdisjoint(report.excluded_sites)
    same = [item for item in report.items if item.listing == "同名"]
    assert {item.site for item in report.items} == {"US"}
    assert all(1 <= len(item.issues) <= 5 for item in report.items)
    retired = next(item for item in same if item.site == "US")
    assert retired.mode == "retired"
    assert {issue.key for issue in retired.issues} == {"erosion", "erosion_cost"}
    us = next(item for item in same if item.site == "US").business
    assert us is not None
    assert number(us.current["revenue"]) == Decimal(900)
    # 仅LZF限制US；其他组同名LISTING仍须按站点隔离。
    for fact in data.operating:
        fact.source.group = "HCM"
    position.group = "HCM"
    other = listing_result(data, [], group="HCM")
    same = [item for item in other.items if item.listing == "同名"]
    assert {item.site for item in same} == {"US", "CA"}
    ca = next(item for item in same if item.site == "CA").business
    assert ca is not None and number(ca.current["revenue"]) == Decimal(200)


def test_inactive_objects_only_keep_stock_or_current_erosion() -> None:
    data = dataset()
    sources = [
        record("2025-09", "US", "old_only", 销售金额="100"),
        record("2025-09", "US", "retired_stock", 销售金额="100"),
        record("2026-09", "US", "fee_only", 基本月度仓储费="-50"),
        record("2026-09", "US", "missing_cost", 销售成本=None),
        record("2026-09", "US", "retired_zero"),
        record("2026-09", "US", "active_zero"),
    ]
    data.operating = [
        OperatingFact(row, financials(row.raw), "SOURCE_PERIOD_GROUP") for row in sources
    ]
    positions = []
    for name in ("old_only", "retired_stock", "fee_only", "missing_cost", "retired_zero"):
        position = record("2026-09", "US", name)
        position.raw = {"产品定位": "已停运"}
        positions.append(position)
    data.cache["products"] = positions
    stocks = [
        InventoryFact(
            {"group": "LZF", "site": "US", "listing": name, "warehouse": "本地仓"},
            {"quantity": Decimal(100), "amount": Decimal(1000), "age270": Decimal(0)},
            record("2026-09", "US", name),
        )
        for name in ("stock_only", "retired_stock")
    ]
    rows = {item.listing: item for item in listing_result(data, stocks).items}
    assert "old_only" not in rows
    assert "retired_zero" not in rows
    assert [issue.key for issue in rows["stock_only"].issues] == ["inventory"]
    assert "本地仓库存100件" in rows["stock_only"].issues[0].detail
    assert "需明确消化或清理安排" in rows["stock_only"].issues[0].detail
    assert [issue.key for issue in rows["retired_stock"].issues] == ["cleanup"]
    assert {issue.key for issue in rows["fee_only"].issues} == {"erosion", "erosion_cost"}
    assert "FBA仓储" in rows["fee_only"].issues[1].detail
    assert rows["missing_cost"].issues[0].status == "待核查"
    assert 3 <= len(rows["active_zero"].issues) <= 5
