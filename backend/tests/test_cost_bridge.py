from decimal import Decimal

from app.services.cost_bridge import leverage, refund_judgement
from app.services.financial_model import COST_LABELS, financials
from tests.test_financial_model import sample


def test_signed_refund_commission_and_expenses_reconcile_profit_bridge() -> None:
    base = financials(sample(销售金额="100", 销售成本="20", FBA佣金="-10"))
    current = financials(sample(销售金额="120", 销售成本="24", FBA佣金="3", 广告费="-5"))
    indicators, scenarios = leverage(current, base)
    total = Decimal(indicators["scale_impact"] or "NaN") + Decimal(indicators["residual"] or "NaN")
    total += sum(Decimal(indicators[f"impact_{key}"] or "NaN") for key in COST_LABELS)
    assert abs(total - Decimal(indicators["profit_change"] or "NaN")) < Decimal("1e-20")
    assert len(scenarios) == 5
    assert indicators["impact_commission"] == "15.0"


def test_nonpositive_profit_does_not_produce_sensitivity_profit() -> None:
    base = financials(sample(销售金额="100", 销售成本="200"))
    current = financials(sample(销售金额="120", 销售成本="200"))
    indicators, scenarios = leverage(current, base)
    assert indicators["profit_elasticity"] is None
    assert all(row["profit"] is None for row in scenarios)
    assert refund_judgement(Decimal(0), Decimal(0)) == "总体稳定"
    assert refund_judgement(Decimal("0.01"), Decimal("-0.02")) == "退款抵消"
    assert refund_judgement(Decimal("0.01"), Decimal("0.007")) == "退款主导"


def test_overview_seven_expenses_leave_other_items_in_residual() -> None:
    base = financials(
        sample(
            销售金额="1000",
            销售成本="200",
            FBA佣金="-100",
            广告费="-40",
            海外仓费用="10",
            FBA赔偿="5",
        )
    )
    current = financials(
        sample(
            销售金额="1200",
            销售成本="240",
            FBA佣金="-90",
            广告费="-60",
            海外仓费用="20",
            FBA赔偿="8",
        )
    )
    values, _ = leverage(current, base)
    assert Decimal(values["seven_cost_impact"] or "NaN") == 18
    assert Decimal(values["other_profit_impact"] or "NaN") == -6
    assert (
        sum(
            Decimal(values[key] or "NaN")
            for key in ("scale_impact", "seven_cost_impact", "other_profit_impact")
        )
        == Decimal(values["profit_change"] or "NaN")
        == 143
    )
    current["purchase"] = None
    incomplete, _ = leverage(current, base)
    assert incomplete["seven_cost_impact"] is None
    assert incomplete["other_profit_impact"] is None
