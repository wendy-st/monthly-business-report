"""原报告品类成本桥：先按款式处理冲回及标准售价，再加总金额算率。"""

from decimal import Decimal

from app.services.cost_analysis import exchange_rates
from app.services.financial_model import Amounts, aggregate, combine, ratio, serialize
from app.services.financial_report import PERIODS, group_facts
from app.services.product_attribution import COST_KEYS
from app.services.report_dataset import OperatingFact, ReportDataset

ZERO = Decimal(0)


def difference(left: Decimal | None, right: Decimal | None) -> Decimal | None:
    return left - right if left is not None and right is not None else None


def restored_cost(periods: dict[str, Amounts], month: str, key: str) -> Decimal | None:
    row = periods[month]
    cost, returns, sales, units = (row[name] for name in (key, "return_qty", "sales_qty", "units"))
    if key == "other_cost" or returns == 0:
        return cost
    if cost is None or returns is None:
        return None
    if sales == 0 and cost <= 0:
        return ZERO
    unit = ratio(cost, units) if cost != 0 and units is not None and units > 0 else None
    if unit is None:
        for candidate in sorted((period for period in periods if period < month), reverse=True):
            previous = periods[candidate]
            value, qty = previous[key], previous["units"]
            if value is not None and value != 0 and qty is not None and qty > 0:
                unit = value / qty
                break
    return cost + unit * returns if unit is not None else None


def product_rates(
    dataset: ReportDataset, facts: list[OperatingFact]
) -> dict[str, dict[str, dict[str, str | None]]]:
    rates = exchange_rates(dataset)
    listings = {
        key: {
            month: aggregate(fact.amounts for fact in pool if fact.source.period == month)
            for month in PERIODS
        }
        for key, pool in group_facts(dataset.operating, "listings").items()
    }
    # 无该期记录是明确的零金额；存在记录而字段缺失仍传播缺失。
    styles: list[tuple[str, str, str, dict[str, Amounts]]] = []
    for pool in group_facts(facts, "styles").values():
        periods: dict[str, Amounts] = {}
        for month in PERIODS:
            selected = [fact for fact in pool if fact.source.period == month]
            periods[month] = (
                aggregate(fact.amounts for fact in selected)
                if selected
                else dict.fromkeys(
                    (
                        "sales_qty",
                        "return_qty",
                        "units",
                        "sales_amount",
                        "return_amount",
                        "revenue",
                        *COST_KEYS,
                    ),
                    ZERO,
                )
            )
        source = pool[0].source
        styles.append((source.group, source.site, source.listing, periods))
    totals = {
        month: aggregate(fact.amounts for fact in facts if fact.source.period == month)
        for month in PERIODS
    }
    output: dict[str, dict[str, dict[str, str | None]]] = {}
    for comparison, month in (("mom", PERIODS[1]), ("yoy", PERIODS[2])):
        inputs: dict[str, list[Decimal | None]] = {}
        for group, site, listing, periods in styles:
            parent = listings[group, site, listing]
            current_fx, base_fx = rates.get((PERIODS[0], site)), rates.get((month, site))
            current, base = periods[PERIODS[0]], periods[month]
            price = next(
                (
                    value
                    for period, fx in ((PERIODS[0], current_fx), (month, base_fx))
                    if (
                        value := ratio(
                            ratio(parent[period]["sales_amount"], fx), parent[period]["sales_qty"]
                        )
                    )
                    is not None
                ),
                None,
            )
            gross = (
                ZERO
                if base["sales_qty"] == 0
                else (
                    base["sales_qty"] * price * current_fx
                    if base["sales_qty"] is not None and price is not None and current_fx
                    else None
                )
            )
            refund = (
                ZERO
                if base["return_amount"] == 0
                else (
                    abs(base["return_amount"]) / base_fx * current_fx
                    if base["return_amount"] is not None and base_fx and current_fx
                    else None
                )
            )
            values = {
                "adjusted_revenue": difference(gross, refund) if current_fx else None,
                "restored_revenue": gross if current_fx else None,
                "current_gross": current["sales_amount"],
            }
            for key in COST_KEYS:
                for field, value in (
                    ("current_abs_" + key, current[key]),
                    ("adjusted_" + key, base[key]),
                    ("current_clean_" + key, restored_cost(periods, PERIODS[0], key)),
                    ("base_clean_" + key, restored_cost(periods, month, key)),
                ):
                    values[field] = abs(value) if value is not None else None
            for key, value in values.items():
                inputs.setdefault(key, []).append(value)
        merged = {key: combine(values) for key, values in inputs.items()}
        output[comparison] = {}
        for key in COST_KEYS:

            def positive_ratio(
                amount: Decimal | None, denominator: Decimal | None
            ) -> Decimal | None:
                return (
                    ratio(amount, denominator)
                    if denominator is not None and denominator > 0
                    else None
                )

            current_rate = positive_ratio(totals[PERIODS[0]][key], totals[PERIODS[0]]["revenue"])
            base_rate = positive_ratio(totals[month][key], totals[month]["revenue"])
            actual = difference(current_rate, base_rate)
            adjusted = difference(
                positive_ratio(merged.get("current_abs_" + key), totals[PERIODS[0]]["revenue"]),
                positive_ratio(merged.get("adjusted_" + key), merged.get("adjusted_revenue")),
            )
            clean = difference(
                positive_ratio(merged.get("current_clean_" + key), merged.get("current_gross")),
                positive_ratio(merged.get("base_clean_" + key), merged.get("restored_revenue")),
            )
            reason = "本期或对比期净销售额非正、缺少对比记录" if actual is None else ""
            if adjusted is None:
                reason += "；标准售价、汇率或成本金额依据不足"
            if clean is None:
                reason += "；退款成本冲回依据不足"
            output[comparison][key] = {
                **serialize(
                    {
                        "current": current_rate,
                        "base": base_rate,
                        "actual": actual,
                        "adjusted": adjusted,
                        "standardization": difference(actual, adjusted),
                        "refund": difference(adjusted, clean),
                        "restored": clean,
                    }
                ),
                "reason": reason.lstrip("；"),
            }
    return output
