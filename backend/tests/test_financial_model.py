from decimal import Decimal

from app.services.financial_model import FIELDS, aggregate, financials


def sample(**overrides: str | None) -> dict[str, str | None]:
    values: dict[str, str | None] = dict.fromkeys(FIELDS.values(), "0")
    values.update(overrides)
    return values


def test_signed_profit_and_return_amounts() -> None:
    values = financials(
        sample(
            销售数量="10",
            退货数量="2",
            销售金额="100",
            退货金额="-20",
            销售成本="20",
            头程运费="5",
            FBA佣金="3",
            站外费用="-2",
        )
    )
    assert values["units"] == 8
    assert values["revenue"] == 80
    assert values["profit"] == 60
    assert values["refund_rate"] == Decimal("0.2")


def test_refunds_take_absolute_value_after_aggregation() -> None:
    result = aggregate(
        [
            financials(sample(销售金额="1000", 退货金额="-100")),
            financials(sample(销售金额="0", 退货金额="20")),
        ]
    )
    assert result["refund_rate"] == Decimal("0.08")


def test_missing_cost_does_not_erase_known_revenue() -> None:
    result = financials(sample(销售金额="100", 销售成本=None))
    assert result["revenue"] == 100
    assert result["profit"] is None


def test_weighted_margin_and_zero_denominator() -> None:
    result = aggregate(
        [
            financials(sample(销售金额="100", 销售成本="90")),
            financials(sample(销售金额="900", 销售成本="720")),
        ]
    )
    assert result["margin"] == Decimal("0.19")
    assert financials(sample())["margin"] is None
