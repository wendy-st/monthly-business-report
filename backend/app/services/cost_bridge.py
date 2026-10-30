"""三种成本口径之间的恒等桥，以及收入利润转换、敏感性。"""

from decimal import Decimal

from pydantic import BaseModel

from app.services.financial_model import (
    COST_LABELS,
    DEDUCTED,
    Amounts,
    combine,
    ratio,
    serialize,
)

OVERVIEW_EXPENSE_KEYS = (
    "purchase",
    "freight",
    "delivery",
    "quality",
    "storage",
    "commission",
    "marketing",
)


class CostBridge(BaseModel):
    key: str
    label: str
    actual: str | None
    adjusted: str | None
    restored: str | None
    standardization: str | None
    refund: str | None
    equivalent: str | None
    judgement: str


def refund_judgement(adjusted: Decimal | None, refund: Decimal | None) -> str:
    if adjusted is None or refund is None:
        return "依据不足"
    if adjusted == 0:
        return "总体稳定" if refund == 0 else "退款抵消"
    if adjusted * refund < 0:
        return "退款抵消"
    weight = abs(refund / adjusted)
    return (
        "退款主导"
        if weight >= Decimal("0.6")
        else ("双重影响" if weight >= Decimal("0.3") else "非退款因素主导")
    )


def cost_bridges(
    deltas: dict[str, dict[str, Decimal | None]],
    revenue: Decimal | None,
) -> list[CostBridge]:
    output = []
    for key, label in COST_LABELS.items():
        actual, adjusted, restored = (
            deltas[basis][key] for basis in ("actual", "price_adjusted", "price_refund_adjusted")
        )
        standard = actual - adjusted if actual is not None and adjusted is not None else None
        refund = adjusted - restored if adjusted is not None and restored is not None else None
        values = serialize(
            {
                "actual": actual,
                "adjusted": adjusted,
                "restored": restored,
                "standardization": standard,
                "refund": refund,
                "equivalent": refund * revenue
                if refund is not None and revenue is not None
                else None,
            }
        )
        output.append(
            CostBridge(
                key=key,
                label=label,
                judgement=refund_judgement(adjusted, refund),
                **values,
            )
        )
    return output


def leverage(
    current: Amounts, base: Amounts
) -> tuple[dict[str, str | None], list[dict[str, str | None]]]:
    current_revenue, base_revenue = current["revenue"], base["revenue"]
    current_profit, base_profit = current["profit"], base["profit"]
    growth = (
        (current_revenue - base_revenue) / base_revenue
        if current_revenue is not None
        and current_revenue > 0
        and base_revenue is not None
        and base_revenue > 0
        else None
    )
    elasticity = None
    if (
        growth is not None
        and abs(growth) >= Decimal("0.01")
        and current_profit is not None
        and current_profit > 0
        and base_profit is not None
        and base_profit > 0
    ):
        elasticity = (current_profit / base_profit - 1) / growth
    receivable = combine(
        current.get(key)
        for key in (
            "revenue",
            "delivery",
            "quality",
            "storage",
            "commission",
            "other_platform",
            "marketing",
            "compensation",
        )
    )
    scale = base_profit * growth if base_profit is not None and growth is not None else None
    impacts: Amounts = {}
    signed_amounts: Amounts = {}
    for key in COST_LABELS:
        left, right = current[key], base[key]
        # 业务组金额拆解保留成本冲回；平台扣费转换为费用方向，赔偿仍为收入方向。
        direction = 1 if key in DEDUCTED or key == "compensation" else -1
        signed_amounts[f"current_amount_{key}"] = left * direction if left is not None else None
        signed_amounts[f"theoretical_amount_{key}"] = (
            right * (1 + growth) * direction if right is not None and growth is not None else None
        )
        impacts[key] = (
            (left - right * (1 + growth)) * (-1 if key in DEDUCTED else 1)
            if left is not None and right is not None and growth is not None
            else None
        )
    total = combine(impacts.values())
    change = (
        current_profit - base_profit
        if current_profit is not None and base_profit is not None
        else None
    )
    residual = (
        change - scale - total
        if change is not None and scale is not None and total is not None
        else None
    )
    seven_cost = combine(impacts[key] for key in OVERVIEW_EXPENSE_KEYS)
    other_profit = (
        change - scale - seven_cost
        if change is not None and scale is not None and seven_cost is not None
        else None
    )
    values = serialize(
        {
            "revenue_growth": growth,
            "profit_elasticity": elasticity,
            "platform_receivable": receivable,
            "conversion": ratio(current_profit, receivable),
            "scale_impact": scale,
            "residual": residual,
            "profit_change": change,
            "seven_cost_impact": seven_cost,
            "all_cost_impact": total,
            "other_profit_impact": other_profit,
            **signed_amounts,
            **{f"impact_{key}": value for key, value in impacts.items()},
        }
    )
    scenarios = []
    for delta in ("-0.1", "-0.05", "0", "0.05", "0.1"):
        shift = Decimal(delta)
        scenarios.append(
            serialize(
                {
                    "shift": shift,
                    "revenue": current_revenue * (1 + shift)
                    if current_revenue is not None
                    else None,
                    "profit": current_profit * (1 + elasticity * shift)
                    if elasticity is not None and current_profit is not None
                    else None,
                }
            )
        )
    return values, scenarios
