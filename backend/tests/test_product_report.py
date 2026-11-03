"""品类页恢复原报告诊断、净成本归因与三期对照，使用合成数据核算。"""

from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app import main
from app.schemas.products import ProductRefundQuery, ProductRefundView
from app.schemas.reports import ReportFilter
from app.services.financial_model import financials
from app.services.financial_report import breakdown, financial_view
from app.services.prepared_reports import PreparedReports
from app.services.product_attribution import PARTS, attribute_costs
from app.services.product_diagnosis import diagnose_styles
from app.services.product_refunds import refund_analysis
from app.services.product_report import product_view
from app.services.report_dataset import OperatingFact
from tests.test_business_report import dataset, record


def fact(month: str, style: str, **values: str | None) -> OperatingFact:
    source = record(month, "US", "TEST", **values)
    source.style = style
    source.msku = style
    return OperatingFact(source, financials(source.raw), "SOURCE_PERIOD_GROUP")


def test_attribution_closes_quantity_unit_other_and_one_period_only() -> None:
    facts = [
        fact("2026-09", "同款", 销售数量="20", 销售成本="240", 头程运费="60", 防伪计划费="5"),
        fact("2026-08", "同款", 销售数量="10", 销售成本="100", 头程运费="20", 防伪计划费="2"),
        fact("2026-09", "本期独有", 销售成本="15"),
        fact("2026-08", "历史独有", 销售成本="11"),
    ]
    result = attribute_costs(facts, "2026-08", False)
    values = result.values
    assert Decimal(values["quantity"] or "NaN") == 120
    assert Decimal(values["unit"] or "NaN") == 60
    assert Decimal(values["other"] or "NaN") == 3
    assert Decimal(values["added"] or "NaN") == 15
    assert Decimal(values["removed"] or "NaN") == -11
    assert Decimal(values["actual_delta"] or "NaN") == 187
    assert sum(Decimal(values[key] or "NaN") for key in PARTS) == 187
    assert values["comparable_count"] == "1"
    assert any("不直接认定为新品或退市" in line for line in result.conclusion)


def test_missing_cost_and_nonpositive_units_do_not_become_zero_or_unit_change() -> None:
    facts = [
        fact("2026-09", "退款款", 销售数量="1", 退货数量="2", 销售成本="-5"),
        fact("2026-08", "退款款", 销售数量="10", 销售成本="100"),
        fact("2026-09", "缺失款", 销售成本=None),
    ]
    result = attribute_costs(facts, "2026-08", True)
    assert result.values["unresolved"] == "-105"
    assert result.values["unit"] == "0"
    assert result.values["missing_count"] == "1"
    assert result.values["actual_delta"] is None
    assert result.values["current_amount"] is None
    assert any("盈亏筛选" in line for line in result.conclusion)


def test_diagnosis_uses_sales_weighted_listing_then_category_fallback() -> None:
    facts = [
        fact("2026-09", "低毛利", 销售金额="100", 销售成本="80"),
        fact("2026-09", "高毛利亏损", 销售金额="900", 销售成本="90", 广告费="-1000"),
        fact("2026-09", "备用", 销售金额="100", 销售成本="5"),
        fact("2026-09", "无净销售", 销售金额="0"),
    ]
    facts[2].source.listing = "OTHER"
    rows = breakdown(facts, "styles")
    contexts = diagnose_styles(rows)
    by_style = {row.dimensions["style"]: contexts[row.key] for row in rows}
    assert by_style["低毛利"].diagnosis == "产品成本问题"
    assert Decimal(by_style["低毛利"].benchmark or "NaN") == Decimal("0.83")
    assert by_style["高毛利亏损"].diagnosis == "费用端问题"
    assert by_style["备用"].basis == "同品类备用基准"
    assert by_style["备用"].diagnosis == "健康盈利"
    assert by_style["无净销售"].diagnosis == "待核验"
    assert by_style["无净销售"].benchmark is None


def test_product_rates_prices_and_scope_keep_backend_authority() -> None:
    data = dataset()
    data.operating[0].source.raw["广告费"] = "9"
    data.operating[0].amounts = financials(data.operating[0].source.raw)
    filters = ReportFilter(site="US")
    view = product_view(data, financial_view(data, filters), filters)
    current = view.breakdowns["categories"][0].current
    assert Decimal(current["marketing_expense_rate"] or "NaN") == Decimal("-0.01")
    assert Decimal(current["operating_margin"] or "NaN") == (
        Decimal(current["operating_profit"] or "NaN") / Decimal(current["revenue"] or "NaN")
    )
    context = next(iter(view.product.contexts.values()))
    assert context.local_price == "20"
    assert context.currency == "USD"
    assert view.product.trends["purchase"]["current"] == "37.5"
    assert view.product.scope_available
    for comparison in view.product.rates.values():
        for cost in comparison.values():
            assert abs(
                Decimal(cost["actual"] or "NaN")
                - Decimal(cost["standardization"] or "NaN")
                - Decimal(cost["adjusted"] or "NaN")
            ) < Decimal("1e-25")
            if cost["restored"] is None:
                assert cost["refund"] is None
                assert "退款成本冲回依据不足" in (cost["reason"] or "")
            else:
                assert abs(
                    Decimal(cost["adjusted"] or "NaN")
                    - Decimal(cost["refund"] or "NaN")
                    - Decimal(cost["restored"])
                ) < Decimal("1e-25")


def test_history_rename_is_unique_and_counted_once() -> None:
    data = dataset()
    data.operating = [fact("2026-09", "现名"), fact("2026-08", "旧名")]
    data.operating[1].source.msku = "现名"
    data.align_historical_styles()
    assert data.operating[1].source.style == "现名"
    result = attribute_costs(data.operating, "2026-08", False)
    assert result.values["known_count"] == "1"
    assert result.values["renamed_source_rows"] == "1"
    assert any("历史金额只计入一次" in line for line in result.conclusion)


def test_cost_bridge_keeps_style_abs_before_sum_and_unrestorable_refunds() -> None:
    from app.services.product_rates import product_rates

    data = dataset()
    data.operating = [
        fact("2026-09", "销售款", 销售数量="10", 销售金额="100", 销售成本="30"),
        fact("2026-09", "冲回款", 销售数量="0", 退货数量="1", 退货金额="-10", 销售成本="-5"),
        fact("2026-08", "销售款", 销售数量="10", 销售金额="50", 销售成本="20"),
    ]
    values = product_rates(data, data.operating)["mom"]["purchase"]
    assert Decimal(values["current"] or "NaN") == Decimal(25) / Decimal(90)
    assert Decimal(values["adjusted"] or "NaN") == Decimal(35) / Decimal(90) - Decimal("0.2")
    assert Decimal(values["restored"] or "NaN") == Decimal("0.1")
    # 退款混合款的零成本且无过去有效成本，不推定可以还原。
    data.operating.append(fact("2026-09", "待核验款", 销售数量="1", 退货数量="1", 销售金额="10"))
    values = product_rates(data, data.operating)["mom"]["purchase"]
    assert values["restored"] is None
    assert values["refund"] is None
    assert values["current"] is not None


def test_search_subset_does_not_borrow_full_scope_attribution() -> None:
    data = dataset()
    data.operating = [fact("2026-09", style, 销售金额="100") for style in ("A1", "A2", "B1")]
    for index, item in enumerate(data.operating):
        item.source.row = index + 1
    filters = ReportFilter(search="A")
    view = product_view(data, financial_view(data, filters), filters)
    assert not view.product.scope_available
    assert view.product.comparisons == {}
    assert view.product.rates == {}
    filters = ReportFilter(search="A1")
    single = product_view(data, financial_view(data, filters), filters)
    assert single.product.scope_available
    assert "单位成本暂无可比数据" in single.product.comparisons["mom"].conclusion[0]


def test_product_cost_rates_keep_book_refund_signs() -> None:
    data = dataset()
    data.operating = [fact("2026-09", "成本冲回", 销售金额="100", 销售成本="-5", 防伪计划费="-2")]
    view = product_view(data, financial_view(data, ReportFilter()), ReportFilter())
    for grain in ("categories", "category2", "category3", "styles"):
        current = view.breakdowns[grain][0].current
        assert current["purchase_rate"] == "-0.05"
        assert current["other_cost_rate"] == "-0.02"


@pytest.mark.parametrize("compensation", ["2", "20", None])
def test_fulfillment_and_marketing_rates_reconcile_detail_amounts(compensation: str | None) -> None:
    data = dataset()
    data.operating = [
        fact(
            "2026-09",
            "费用款",
            销售金额="100",
            销售成本="20",
            头程运费="5",
            FBA佣金="-10",
            FBA赔偿=compensation,
            海外仓费用="5",
            广告费="-3",
            站外费用="4",
            促销折扣="-1",
            Coupon="-2",
            Deal="-3",
        )
    ]
    view = product_view(data, financial_view(data, ReportFilter()), ReportFilter())
    for grain in ("categories", "category2", "category3"):
        row = view.breakdowns[grain][0]
        current = row.current
        assert current["marketing_expense_rate"] == "0.13"
        assert row.previous["fulfillment_expense_rate"] is None
        if compensation is None:
            assert current["fulfillment_expense_rate"] is None
            assert current["margin"] is None
            continue
        fee = (Decimal(15) - Decimal(compensation)) / 100
        assert Decimal(current["fulfillment_expense_rate"] or "NaN") == fee
        assert Decimal(current["margin"] or "NaN") == Decimal("0.75") - fee - Decimal("0.13")


def test_refund_sample_boundary_missing_values_and_original_rates() -> None:
    report = financial_view(dataset(), ReportFilter())
    template = report.breakdowns["styles"][0]
    report.breakdowns["styles"] = [
        template.model_copy(
            update={
                "key": key,
                "record_count": count,
                "current": {
                    **template.current,
                    "sales_qty": quantity,
                    "refund_rate": rate,
                    "units": "1",
                },
            }
        )
        for key, quantity, rate, count in (
            ("low", "99", "2", 1),
            ("boundary", "100", "0.15", 1),
            ("missing-qty", None, "0.8", 1),
            ("missing-rate", "100", None, 1),
            ("history-only", "1", "9", 0),
        )
    ]
    original = report.model_dump()
    analysis = refund_analysis(report, 100)
    assert analysis.total_styles == 4
    assert analysis.low_sales_count == 1
    assert analysis.low_sales_share == "0.25"
    assert Decimal(analysis.low_sales_qty_share or "NaN") == Decimal(99) / Decimal(299)
    assert analysis.missing_sales_count == 1
    assert analysis.statuses["missing-qty"] == "missing_sales"
    assert analysis.statuses["missing-rate"] == "eligible"
    assert analysis.eligible_keys == analysis.ranking_keys == ["boundary"]
    assert analysis.abnormal_keys == []
    assert refund_analysis(report, 101).eligible_keys == []
    assert refund_analysis(report, 1).abnormal_keys == ["low"]
    assert report.model_dump() == original
    report.breakdowns["styles"] = []
    empty = refund_analysis(report, 100)
    assert empty.total_styles == 0
    assert empty.low_sales_share is empty.low_sales_qty_share is None


def test_refund_api_scope_cache_and_query_validation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "report-2026-09.json").write_text('{"identity":"synthetic"}', encoding="utf-8")
    reports = PreparedReports(tmp_path, "rules-one")
    data = dataset()
    data.operating = [fact("2026-09", "测试款", 销售数量="100", 销售金额="1000", 退货金额="-200")]
    scope = ReportFilter(site="US")
    report = financial_view(data, scope)
    reports.cache.result("financial", scope.model_dump(), lambda: report)
    monkeypatch.setattr(main, "reports", lambda: reports)

    def response(min_sales: int = 100) -> ProductRefundView:
        result = main.product_refunds("2026-09", ProductRefundQuery(site="US", min_sales=min_sales))
        return ProductRefundView.model_validate_json(Path(result.path).read_bytes())

    analysis = response()
    assert analysis.min_sales == 100
    assert analysis.total_styles == 1
    assert len(analysis.ranking_keys) == len(analysis.abnormal_keys) == 1
    assert response(101).low_sales_count == 1
    assert response() == analysis
    assert "dataset" not in reports.__dict__
    for value in (0, -1, "1.5", "abc"):
        with pytest.raises(ValidationError):
            ProductRefundQuery.model_validate({"min_sales": value})
    with pytest.raises(ValidationError):
        ProductRefundQuery.model_validate({"unexpected": "yes"})
    with pytest.raises(HTTPException) as error:
        main.product_refunds("2026-10", ProductRefundQuery())
    assert error.value.status_code == 404
    operation = main.app.openapi()["paths"]["/api/reports/{month}/product-refunds"]["get"]
    assert any(
        item["name"] == "min_sales" and item["schema"]["default"] == 100
        for item in operation["parameters"]
    )
