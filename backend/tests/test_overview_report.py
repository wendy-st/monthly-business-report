"""总览聚合、排名和比较必须使用后端权威结果。"""

import json
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app import main
from app.schemas.overview import OverviewView
from app.schemas.reports import FinancialQuery, FinancialView, MetricRow, ReportFilter
from app.services.cost_analysis import BasisAnalysis, comparison_rows
from app.services.financial_model import financials, serialize
from app.services.overview_report import (
    conversion_changes,
    merge_rows,
    overview_details,
    overview_row,
    regroup,
)
from app.services.prepared_reports import PreparedReports
from tests.test_business_report import dataset
from tests.test_financial_model import sample


def fixture_row(group: str, site: str, shop: str, sales: str, cost: str) -> MetricRow:
    current = serialize(financials(sample(销售金额=sales, 销售成本=cost, 销售数量="10")))
    base = serialize(financials(sample(销售金额="100", 销售成本="50", 销售数量="10")))
    return MetricRow(
        key=shop,
        label=shop,
        dimensions={"group": group, "site": site, "shop": shop, "listing": "X", "category3": "鞋"},
        current=current,
        previous=base,
        year_ago=base,
        record_count=1,
        source_rows=[1],
        status="OK",
    )


def fixture_report() -> FinancialView:
    rows = [
        fixture_row("A", "US", "a:US", "100", "90"),
        fixture_row("B", "US", "b:US", "300", "400"),
        fixture_row("B", "CA", "c:CA", "50", "40"),
    ]
    return FinancialView(
        summary=merge_rows(rows, "all", "总计", {}),
        series=[],
        breakdowns={
            "groups": regroup(rows, ("group",)),
            "sites": regroup(rows, ("site",)),
            "category3": rows,
            "listings": rows,
            "shops": rows,
        },
        waterfall={},
        options={"site": ["US", "CA"]},
        warnings=[],
        snapshot_id="synthetic",
    )


def fixture_analysis() -> BasisAnalysis:
    current = financials(sample(销售金额="1200", 销售成本="500"))
    base = financials(sample(销售金额="1000", 销售成本="500"))
    return BasisAnalysis(
        basis="actual",
        comparison="yoy",
        current=serialize(current),
        base=serialize(base),
        rows=comparison_rows(current, base),
        unavailable_listings=0,
    )


def test_conversion_signs_zero_and_missing_are_distinct() -> None:
    item = fixture_analysis()
    assert conversion_changes([item])["yoy"]["actual"] == {
        "revenue": "+20.0%",
        "profit": "+40.0%",
    }
    item.base["revenue"] = "0"
    item.current["profit"] = None
    assert conversion_changes([item])["yoy"]["actual"] == {"revenue": None, "profit": None}


def test_rankings_combine_groups_but_keep_sites_and_weighted_subtotals() -> None:
    full = fixture_report()
    original = full.model_dump_json()
    view = overview_details(full, [])
    assert full.model_dump_json() == original
    assert [row.dimensions["site"] for row in view.sales_top10] == ["US", "CA"]
    assert view.sales_top10[0].current["revenue"] == "400"
    assert view.loss_top10[0].current["profit"] == "-90"
    assert len(view.loss_top10) == 1
    assert len(view.categories) == 1
    assert view.categories[0].bar_ratio == "1"
    assert sum(Decimal(row.revenue_share or "NaN") for row in view.groups) == Decimal(1)
    assert Decimal(view.shop_totals["US"].current["margin"] or "NaN") == Decimal("-0.225")
    assert view.shop_totals["US"].deltas["profit_yoy"] == "-190"
    assert Decimal(view.shop_totals["US"].deltas["margin_yoy"] or "NaN") == Decimal("-0.725")


def test_missing_profit_and_zero_denominator_never_become_zero_contribution() -> None:
    row = fixture_row("A", "US", "a:US", "0", "0")
    row.current["profit"] = None
    result = overview_row(row, row)
    assert result.revenue_share is None
    assert result.profit_share is None
    assert result.deltas["profit_yoy"] is None
    assert result.current["profit"] is None


def test_overview_growth_rounds_once_from_full_precision() -> None:
    row = fixture_row("A", "US", "a:US", "77.6501", "0")
    row.previous["revenue"] = "100"
    row.changes["revenue_mom"] = "-22.35%"
    result = overview_row(row, row)
    assert result.changes["revenue_mom"] == "-22.3%"
    assert row.changes["revenue_mom"] == "-22.35%"


def test_summary_uses_actual_basis_and_original_significance_threshold() -> None:
    report = fixture_report()
    actual = fixture_analysis()
    adjusted = actual.model_copy(deep=True)
    adjusted.basis = "price_refund_adjusted"
    adjusted.current["profit"] = "999999"
    for row in actual.rows:
        row.delta = "-0.0009" if row.key == "commission" else row.delta
    view = overview_details(report, [actual, adjusted])
    assert view.conclusions["yoy"][0].detail == "9月净利润同比增加0.02万。"
    assert "FBA佣金" not in view.conclusions["yoy"][3].detail
    assert len(view.conclusions["yoy"]) == 5


def test_shop_comparison_scope_only_tracks_shops_present_this_month() -> None:
    report = fixture_report()
    historical = fixture_row("A", "US", "old:US", "0", "0")
    historical.record_count = 0
    historical.current = dict.fromkeys(historical.current)
    report.breakdowns["shops"].append(historical)
    view = overview_details(report, [])
    assert len(view.shops) == 3
    assert view.shop_totals[""].previous["revenue"] == "300"


def test_overview_reuses_prepared_financial_and_cost_results(tmp_path: Path) -> None:
    (tmp_path / "report-2026-09.json").write_text('{"identity":"synthetic"}', encoding="utf-8")
    reports = PreparedReports(tmp_path, "rules-one")
    parameters = ReportFilter().model_dump()
    reports.cache.result("financial", parameters, fixture_report)
    reports.cache.result("costs", parameters, lambda: [fixture_analysis()])
    result = OverviewView.model_validate_json(reports.path("overview").read_bytes())
    assert len(result.overview.sales_top10) == 2
    assert "dataset" not in reports.__dict__
    assert "overview" not in fixture_report().model_dump()


def test_overview_api_contract_keeps_other_views_and_validates_query(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "report-2026-09.json").write_text('{"identity":"synthetic"}', encoding="utf-8")
    reports = PreparedReports(tmp_path, "rules-one")
    reports.__dict__["dataset"] = dataset()
    parameters = ReportFilter().model_dump()
    reports.cache.result("financial", parameters, fixture_report)
    reports.cache.result("costs", parameters, lambda: [fixture_analysis()])
    monkeypatch.setattr(main, "reports", lambda: reports)
    overview = main.financial("2026-09", FinancialQuery(view="overview"))
    assert overview.status_code == 200
    assert len(json.loads(Path(overview.path).read_bytes())["overview"]["sales_top10"]) == 2
    for view in ("full", "business"):
        response = main.financial("2026-09", FinancialQuery.model_validate({"view": view}))
        assert response.status_code == 200
        assert "overview" not in json.loads(Path(response.path).read_bytes())
    # 品类页扩展了款式诊断及归因契约，须使用完整合成底表生成。
    response = main.financial("2026-09", FinancialQuery(view="products", site="US"))
    product = json.loads(Path(response.path).read_bytes())
    assert "overview" not in product
    assert product["product"]["style_count"] > 0
    with pytest.raises(ValidationError):
        FinancialQuery.model_validate({"view": "unknown"})
    with pytest.raises(ValidationError):
        FinancialQuery.model_validate({"unexpected": "yes"})
    with pytest.raises(HTTPException) as error:
        main.financial("2026-10", FinancialQuery(view="overview"))
    assert error.value.status_code == 404
