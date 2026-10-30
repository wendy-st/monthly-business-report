"""退款成本优先识别明细，其次当期单位成本及严格过去的同站点LISTING。"""

from collections import defaultdict
from decimal import Decimal
from functools import lru_cache

from app.services.financial_model import Amounts, aggregate, combine, derive
from app.services.historical_report import historical_amounts
from app.services.report_dataset import ReportDataset

COMMISSION_REFUND_RATE = Decimal("0.8")
ListingKey = tuple[str, str]


def commission_ratio(amounts: Amounts) -> Decimal | None:
    gross, refund, commission = (
        amounts.get("sales_amount"),
        amounts.get("return_amount"),
        amounts.get("commission"),
    )
    if gross is None or refund is None or commission is None:
        return None
    denominator = gross - COMMISSION_REFUND_RATE * abs(refund)
    return commission / denominator if denominator > 0 else None


def fallback_commission(periods: dict[str, Amounts], month: str) -> Decimal | None:
    return next(
        (
            rate
            for period in (month, "2026-09", "2026-08", "2025-09")
            if (rate := commission_ratio(periods.get(period, {}))) not in (None, Decimal(0))
        ),
        None,
    )


def restore_commission(
    amounts: Amounts,
    fallback: Decimal | None = None,
    detail: Decimal | None = None,
) -> Decimal | None:
    commission, gross, refund = (
        amounts["commission"],
        amounts["sales_amount"],
        amounts["return_amount"],
    )
    if commission == 0:
        return Decimal(0)
    if commission is None or gross is None or refund is None:
        return None
    if gross == 0 and refund != 0 and commission > 0:
        return Decimal(0)
    rate = commission_ratio(amounts)
    effective = rate if rate is not None else fallback
    return effective * gross if effective is not None else detail


def identifiable_detail(rows: list[Amounts], key: str) -> Decimal | None:
    if key == "commission":
        # 佣金可用每行金额还原；销售与退款并存只阻止采购和头程的直接拆分。
        return combine(restore_commission(row) for row in rows)
    output = []
    for row in rows:
        sales, returns, cost = row["sales_qty"], row["return_qty"], row[key]
        if sales is None or returns is None or cost is None:
            return None
        if sales > 0 and returns > 0:
            return None
        if sales == 0 and returns > 0:
            if cost <= 0:
                output.append(Decimal(0))
            else:
                return None
        else:
            output.append(cost)
    return combine(output)


@lru_cache(maxsize=1)
def history_costs(dataset: ReportDataset) -> dict[ListingKey, dict[str, Amounts]]:
    pools: dict[tuple[str, str, str], list[Amounts]] = defaultdict(list)
    for source in dataset.records("history"):
        if source.site and source.listing and source.period:
            pools[source.site, source.listing, source.period].append(historical_amounts(source))
    output: dict[ListingKey, dict[str, Amounts]] = defaultdict(dict)
    for (site, listing, month), rows in pools.items():
        output[site, listing][month] = aggregate(rows)
    return dict(output)


def past_unit_costs(
    dataset: ReportDataset, key: ListingKey, month: str, periods: dict[str, Amounts]
) -> Amounts:
    candidates = {**history_costs(dataset).get(key, {}), **periods}
    units: Amounts = {}
    for name in ("purchase", "freight"):
        for candidate in sorted((period for period in candidates if period < month), reverse=True):
            row = candidates[candidate]
            quantity, cost = row.get("units"), row.get(name)
            if quantity is not None and quantity > 0 and cost is not None and cost > 0:
                units[name] = cost / quantity
                break
    return units


def restore_costs(
    amounts: Amounts,
    units: Amounts | None = None,
    detail: Amounts | None = None,
    fallback_commission: Decimal | None = None,
) -> Amounts:
    result = amounts.copy()
    returns, sales, quantity = amounts["return_qty"], amounts["sales_qty"], amounts["units"]
    for key in ("purchase", "freight"):
        cost = amounts[key]
        if returns == 0:
            continue
        unit = (units or {}).get(key)
        if quantity is not None and quantity > 0 and cost is not None and cost >= 0:
            unit = cost / quantity
        if (detail or {}).get(key) is not None:
            result[key] = (detail or {})[key]
        elif sales == 0 and cost is not None and cost <= 0:
            result[key] = Decimal(0)
        else:
            result[key] = (
                cost + unit * returns
                if cost is not None and unit is not None and returns is not None
                else None
            )
    result["commission"] = restore_commission(
        amounts, fallback_commission, (detail or {}).get("commission")
    )
    result["return_amount"] = Decimal(0)
    result["return_qty"] = Decimal(0)
    return derive(result)


def restore_listing(
    dataset: ReportDataset,
    key: ListingKey,
    month: str,
    rows: list[Amounts],
    periods: dict[str, Amounts],
) -> Amounts:
    amounts = aggregate(rows)
    fallback = fallback_commission(periods, month)
    detail = {
        name: identifiable_detail(rows, name) for name in ("purchase", "freight", "commission")
    }
    return restore_costs(amounts, past_unit_costs(dataset, key, month, periods), detail, fallback)
