from decimal import Decimal

from app.schemas.reports import ReportFilter
from app.services.cost_analysis import analyses, comparison_rows, normalize_base
from app.services.financial_model import aggregate, financials
from app.services.refund_restoration import (
    fallback_commission,
    identifiable_detail,
    past_unit_costs,
    restore_costs,
)
from app.services.report_dataset import OperatingFact, ReportDataset
from app.services.source_import import SourceRecord
from tests.test_financial_model import sample


def test_overview_expense_scope_and_theoretical_amount_keep_missing_distinct() -> None:
    base = financials(sample(销售金额="1000", 销售成本="200"))
    current = financials(sample(销售金额="1200", 销售成本="250"))
    rows = comparison_rows(current, base)
    assert {row.key for row in rows if row.overview_expense} == {
        "purchase",
        "freight",
        "delivery",
        "quality",
        "storage",
        "commission",
        "marketing",
    }
    purchase = next(row for row in rows if row.key == "purchase")
    assert Decimal(purchase.change_rate or "NaN") == Decimal("0.25")
    assert Decimal(purchase.theoretical_amount or "NaN") == 240
    assert Decimal(purchase.profit_impact or "NaN") == -10
    assert len(rows) == 11
    current["purchase"] = None
    missing = next(row for row in comparison_rows(current, base) if row.key == "purchase")
    assert missing.change_rate is None
    assert missing.profit_impact is None
    assert missing.current is None
    assert Decimal(missing.theoretical_amount or "NaN") == 240


def test_price_adjustment_changes_platform_fx_and_preserves_rmb_cost() -> None:
    current = financials(sample(销售数量="10", 销售金额="200"))
    base = financials(
        sample(销售数量="20", 销售金额="100", 退货金额="-10", 销售成本="30", FBA佣金="-10")
    )
    adjusted = normalize_base(base, current, Decimal(10), Decimal(5))
    assert adjusted["sales_amount"] == 400
    assert adjusted["return_amount"] == -20
    assert adjusted["purchase"] == 30
    assert adjusted["commission"] == -20


def test_refund_restores_cost_and_commission() -> None:
    actual = financials(
        sample(
            销售数量="10",
            退货数量="2",
            销售金额="100",
            退货金额="-20",
            销售成本="40",
            FBA佣金="-8.4",
        )
    )
    restored = restore_costs(actual)
    assert restored["purchase"] == 50
    assert restored["commission"] == -10
    assert restored["revenue"] == 100


def test_pure_refund_and_missing_fx() -> None:
    actual = financials(
        sample(
            销售数量="0", 退货数量="2", 销售金额="0", 退货金额="-20", 销售成本="-10", FBA佣金="2"
        )
    )
    restored = restore_costs(actual)
    assert restored["purchase"] == 0
    assert restored["commission"] == 0
    assert normalize_base(actual, actual, None, Decimal(5))["revenue"] is None


def test_refund_detail_has_priority_and_mixed_rows_are_not_presumed_split() -> None:
    sale = financials(sample(销售数量="10", 销售成本="50"))
    refund = financials(sample(销售数量="0", 退货数量="2", 销售成本="-4"))
    assert identifiable_detail([sale, refund], "purchase") == 50
    mixed = financials(sample(销售数量="10", 退货数量="2", 销售成本="46"))
    assert identifiable_detail([mixed], "purchase") is None
    assert restore_costs(mixed, detail={"purchase": Decimal(50)})["purchase"] == 50


def test_history_unit_cost_never_uses_future_period() -> None:
    dataset = ReportDataset.__new__(ReportDataset)
    dataset.cache = {"history": []}
    past = financials(sample(销售数量="10", 销售成本="50", 头程运费="20"))
    zero = financials(sample(销售数量="10", 销售成本="0", 头程运费="0"))
    future = financials(sample(销售数量="10", 销售成本="990", 头程运费="990"))
    units = past_unit_costs(
        dataset,
        ("US", "X"),
        "2026-08",
        {"2026-06": past, "2026-07": zero, "2026-09": future},
    )
    assert units == {"purchase": Decimal(5), "freight": Decimal(2)}
    current = financials(sample(销售数量="1", 退货数量="3", 销售成本="-4", 头程运费="-1"))
    restored = restore_costs(current, units=units)
    assert restored["purchase"] == 11
    assert restored["freight"] == 5


def test_style_price_adjustment_uses_listing_price() -> None:
    style = financials(sample(销售数量="2", 销售金额="100"))
    listing = financials(sample(销售数量="10", 销售金额="200"))
    base = financials(sample(销售数量="3", 销售金额="60"))
    adjusted = normalize_base(base, style, Decimal(1), Decimal(1), (listing, base))
    assert adjusted["sales_amount"] == 60


def test_mixed_commission_detail_restores_when_aggregate_basis_is_nonpositive() -> None:
    mixed = financials(
        sample(
            销售数量="1",
            退货数量="1",
            销售金额="100",
            退货金额="-100",
            FBA佣金="-3",
        )
    )
    refund = financials(
        sample(
            销售数量="0",
            退货数量="1",
            销售金额="0",
            退货金额="-100",
            FBA佣金="12",
        )
    )
    detail = identifiable_detail([mixed, refund], "commission")
    assert detail == -15
    assert (
        restore_costs(aggregate([mixed, refund]), detail={"commission": detail})["commission"]
        == -15
    )
    assert identifiable_detail([mixed], "purchase") is None
    missing = financials(sample(FBA佣金=None))
    assert identifiable_detail([mixed, missing], "commission") is None


def test_zero_commission_rate_does_not_block_valid_comparison_fallback() -> None:
    target = financials(sample(销售金额="100", 退货金额="-200", FBA佣金="9"))
    current = financials(sample(销售金额="100", FBA佣金="0"))
    older = financials(sample(销售金额="100", FBA佣金="-15"))
    rate = fallback_commission({"2026-08": target, "2026-09": current, "2025-09": older}, "2026-08")
    assert rate == Decimal("-0.15")
    assert restore_costs(target, fallback_commission=rate)["commission"] == -15


def source(month: str, raw: dict[str, str | None]) -> SourceRecord:
    return SourceRecord(
        period=month,
        group="测试组",
        site="US",
        listing="TEST",
        category1="测试品类",
        category2="",
        category3="",
        style="测试款式",
        msku="TEST-1",
        sku="",
        file="synthetic.xlsx",
        sheet="经营底表",
        row=1,
        raw=raw,
    )


def comparison_dataset(current: SourceRecord, base: list[SourceRecord]) -> ReportDataset:
    dataset = ReportDataset.__new__(ReportDataset)
    dataset.operating = [
        OperatingFact(s, financials(s.raw), "SOURCE_PERIOD_GROUP") for s in [current, *base]
    ]
    dataset.cache = {
        "history": [],
        "rates": [
            source(p, {"US": "2" if p == "2026-09" else "1"})
            for p in ("2026-09", "2026-08", "2025-09")
        ],
    }
    return dataset


def test_comparison_commission_restores_after_price_and_fx_normalization() -> None:
    current = source("2026-09", sample(销售数量="2", 销售金额="800", FBA佣金="-120"))
    base = source(
        "2026-08",
        sample(
            销售数量="2",
            退货数量="1",
            销售金额="200",
            退货金额="-50",
            FBA佣金="-24",
        ),
    )
    results = analyses(comparison_dataset(current, [base]), ReportFilter())
    actual = next(a for a in results if a.comparison == "mom" and a.basis == "actual")
    restored = next(
        a for a in results if a.comparison == "mom" and a.basis == "price_refund_adjusted"
    )
    # 标准化收入800、退款100、佣金-48；还原佣金=-48/(800-0.8*100)*800。
    expected = Decimal(-48) / Decimal(720) * Decimal(800)
    assert Decimal(restored.base["commission"] or "NaN") == expected
    assert restored.base["revenue"] == "800"
    assert actual.base["commission"] == "-24"
    assert actual.base["revenue"] == "150"


def test_comparison_commission_detail_fallback_changes_fx_only() -> None:
    current = source("2026-09", sample())
    mixed = source(
        "2026-08",
        sample(
            销售数量="1",
            退货数量="1",
            销售金额="100",
            退货金额="-100",
            FBA佣金="-3",
        ),
    )
    refund = source(
        "2026-08",
        sample(
            销售数量="0",
            退货数量="1",
            销售金额="0",
            退货金额="-100",
            FBA佣金="12",
        ),
    )
    results = analyses(comparison_dataset(current, [mixed, refund]), ReportFilter())
    restored = next(
        a for a in results if a.comparison == "mom" and a.basis == "price_refund_adjusted"
    )
    assert Decimal(restored.base["commission"] or "NaN") == -30
    assert restored.base["revenue"] == "200"
