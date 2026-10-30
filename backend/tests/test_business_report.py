"""业务组须保留历史MX、同名跨站隔离、原币均价及有符号退款桥。"""

from decimal import Decimal

from app.schemas.reports import ReportFilter
from app.services.business_report import business_details, business_row, refund_totals, site_totals
from app.services.cost_analysis import analyses, comparison_rows
from app.services.cost_bridge import leverage
from app.services.financial_model import financials
from app.services.financial_report import financial_view, select_facts
from app.services.report_dataset import OperatingFact, ReportDataset
from app.services.source_import import SourceRecord
from tests.test_financial_model import sample


def record(month: str, site: str, listing: str, **values: str | None) -> SourceRecord:
    return SourceRecord(
        month,
        "LZF",
        site,
        listing,
        "鞋",
        "水鞋",
        listing,
        "款式",
        "MSKU",
        "SKU",
        "合成",
        "底表",
        3,
        sample(**values),
    )


def dataset() -> ReportDataset:
    data = ReportDataset.__new__(ReportDataset)
    sources = [
        record(
            "2026-09",
            "US",
            "同名",
            销售数量="10",
            销售金额="1000",
            退货数量="2",
            退货金额="-100",
            销售成本="300",
        ),
        record("2026-09", "CA", "同名", 销售数量="10", 销售金额="200", 销售成本="300"),
        record("2026-08", "US", "同名", 销售数量="10", 销售金额="800", 销售成本="300"),
        record("2025-09", "US", "同名", 销售数量="20", 销售金额="700", 销售成本="300"),
        record("2025-09", "MX", "旧款", 销售数量="11", 销售金额="2700", 销售成本="100"),
        record("2026-09", "DE", "欧款", 销售数量="1", 销售金额="20"),
        record("2026-09", "FR", "欧款", 销售数量="1", 销售金额="30"),
    ]
    data.operating = [
        OperatingFact(row, financials(row.raw), "SOURCE_PERIOD_GROUP") for row in sources
    ]
    rates = []
    for month in ("2026-09", "2026-08", "2025-09"):
        rate = record(month, "", "")
        rate.raw = {"US": "5", "CA": "4", "MX": "1", "DE/FR/IT/ES": "8"}
        rates.append(rate)
    data.cache = {"rates": rates, "products": [], "history": []}
    data.manifest = {"identity": "synthetic"}
    return data


def test_historical_mx_stays_in_summary_and_listing_names_do_not_cross_sites() -> None:
    data = dataset()
    filters = ReportFilter(group="LZF")
    report = financial_view(data, filters)
    assert report.summary.year_ago["units"] == "31"
    assert report.summary.year_ago["revenue"] == "3400"
    details = business_details(data, report, analyses(data, filters), filters)
    assert "MX" not in [row.dimensions["site"] for row in details.listings]
    assert {(row["site"], row["listing"]) for row in details.listing_options} >= {
        ("US", "同名"),
        ("CA", "同名"),
    }
    selected = ReportFilter(group="LZF", listing="同名", listing_site="CA")
    facts = select_facts(data, selected)
    assert {fact.source.site for fact in facts} == {"CA"}
    assert financial_view(data, selected).summary.current["revenue"] == "200"
    europe = select_facts(data, ReportFilter(group="LZF", site="DE/IT/FR/ES"))
    assert {fact.source.site for fact in europe} == {"DE", "FR"}


def test_prices_use_gross_amount_and_exact_month_fx_and_weighted_subtotals() -> None:
    data = dataset()
    filters = ReportFilter(group="LZF")
    report = financial_view(data, filters)
    details = business_details(data, report, [], filters)
    us = next(row for row in details.listings if row.dimensions["site"] == "US")
    assert us.prices["current"] == "20"  # 1000 / 5 / 10，不使用净收入900。
    assert us.currency == "USD"
    assert us.current["return_rate"] == "0.2"
    assert Decimal(us.current["operating_margin"] or "NaN") == Decimal(600) / 900
    missing = business_row(us, report.summary, {})
    assert missing.prices["current"] is None
    totals = site_totals(
        [row for row in details.listings if row.dimensions["site"] == "US"], report.summary
    )
    assert totals[0].subtotal
    assert totals[0].current["profit"] == us.current["profit"]
    assert totals[0].current["margin"] == us.current["margin"]
    assert details.category_total == "1150"
    assert details.categories[0].label == "同名"


def test_refund_summary_uses_profit_direction_and_propagates_missing() -> None:
    data = dataset()
    costs = analyses(data, ReportFilter(group="LZF"))
    actual = next(item for item in costs if item.comparison == "mom" and item.basis == "actual")
    adjusted = next(
        item for item in costs if item.comparison == "mom" and item.basis == "price_adjusted"
    )
    restored = next(
        item for item in costs if item.comparison == "mom" and item.basis == "price_refund_adjusted"
    )
    actual.current["margin"], actual.base["margin"] = "0.14", "0.12"
    adjusted.current["margin"], adjusted.base["margin"] = "0.14", "0.13"
    restored.current["margin"], restored.base["margin"] = "0.17", "0.18"
    # 展示桥的绝对费用方向不能冒充利润率方向，合计直接采用各口径利润率变化。
    for row in actual.bridges:
        row.refund = "0.50"
    totals = refund_totals(costs)["mom"]
    assert Decimal(totals["actual"] or "NaN") == Decimal("0.02")
    assert Decimal(totals["adjusted"] or "NaN") == Decimal("0.01")
    assert Decimal(totals["restored"] or "NaN") == Decimal("-0.01")
    assert Decimal(totals["refund"] or "NaN") == Decimal("0.02")
    assert Decimal(totals["equivalent"] or "NaN") == Decimal("23")
    restored.current["margin"] = None
    assert refund_totals(costs)["mom"]["refund"] is None


def test_profit_impacts_reconcile_all_eleven_items() -> None:
    for item in analyses(dataset(), ReportFilter(group="LZF")):
        indicators = item.leverage
        if indicators["all_cost_impact"] is not None:
            total = sum(Decimal(indicators[f"impact_{row.key}"] or "NaN") for row in item.rows)
            assert abs(total - Decimal(indicators["all_cost_impact"] or "NaN")) < Decimal("1e-20")
            scale = Decimal(indicators["scale_impact"] or "NaN")
            residual = Decimal(indicators["residual"] or "NaN")
            assert abs(
                scale + total + residual - Decimal(indicators["profit_change"] or "NaN")
            ) < Decimal("1e-20")


def test_business_impact_amounts_keep_cost_reversals() -> None:
    current = financials(sample(销售金额="1200"))
    base = financials(sample(销售金额="1000"))
    current["delivery"], base["delivery"] = Decimal("30"), Decimal("-100")
    current["compensation"], base["compensation"] = Decimal("20"), Decimal("10")
    result, _ = leverage(current, base)
    assert Decimal(result["current_amount_delivery"] or "NaN") == -30
    assert Decimal(result["theoretical_amount_delivery"] or "NaN") == 120
    assert Decimal(result["impact_delivery"] or "NaN") == 150
    assert Decimal(result["current_amount_compensation"] or "NaN") == 20
    assert Decimal(result["theoretical_amount_compensation"] or "NaN") == 12
    assert Decimal(result["impact_compensation"] or "NaN") == 8
    current["other_platform"], base["other_platform"] = Decimal("60"), Decimal("100")
    signed = {row.key: row for row in comparison_rows(current, base, signed=True)}
    assert signed["other_platform"].current == "-60"
    assert signed["other_platform"].base == "-100"
    assert signed["other_platform"].change_rate is None
    assert signed["other_platform"].elasticity is None
    assert Decimal(signed["other_platform"].delta or "NaN") == Decimal("0.05")
    burden = {row.key: row for row in comparison_rows(current, base)}
    assert burden["other_platform"].current == "60"
