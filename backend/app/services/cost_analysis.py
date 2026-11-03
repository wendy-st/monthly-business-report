"""按站点、LISTING分别标准化价格与汇率，再汇总三种分析口径。"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.reports import ReportFilter
from app.services.cost_bridge import OVERVIEW_EXPENSE_KEYS, CostBridge, cost_bridges, leverage
from app.services.financial_model import (
    COST_LABELS,
    DEDUCTED,
    FIELDS,
    Amounts,
    aggregate,
    derive,
    number,
    ratio,
    serialize,
)
from app.services.financial_report import select_facts
from app.services.refund_restoration import (
    fallback_commission,
    identifiable_detail,
    restore_commission,
    restore_listing,
)
from app.services.report_dataset import OperatingFact, ReportDataset
from app.services.report_period import ReportPeriod

RMB_FIELDS = {"purchase", "freight", "disposal", "anti_fake", "overseas"}


class CostComparison(BaseModel):
    key: str
    label: str
    current: str | None
    base: str | None
    current_rate: str | None
    base_rate: str | None
    delta: str | None
    elasticity: str | None
    profit_impact: str | None
    reason: str
    overview_expense: bool
    change_rate: str | None
    theoretical_amount: str | None


class BasisAnalysis(BaseModel):
    basis: str
    comparison: str
    current: dict[str, str | None]
    base: dict[str, str | None]
    rows: list[CostComparison]
    business_rows: list[CostComparison] = []
    unavailable_listings: int
    bridges: list[CostBridge] = []
    leverage: dict[str, str | None] = {}
    scenarios: list[dict[str, str | None]] = []


def text(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


def exchange_rates(dataset: ReportDataset) -> dict[tuple[str, str], Decimal]:
    rates: dict[tuple[str, str], Decimal] = {}
    for record in dataset.records("rates"):
        for site in ("US", "CA", "MX", "UK", "JP", "DE", "FR", "IT", "ES"):
            column = "DE/FR/IT/ES" if site in {"DE", "FR", "IT", "ES"} else site
            value = number(record.raw.get(column))
            key = (record.period, site)
            if value and value > 0:
                if key in rates and rates[key] != value:
                    raise ValueError("同月份站点存在冲突汇率")
                rates[key] = value
    return rates


def normalize_base(
    base: Amounts,
    current: Amounts,
    current_fx: Decimal | None,
    base_fx: Decimal | None,
    price_context: tuple[Amounts, Amounts] | None = None,
) -> Amounts:
    result = base.copy()
    if current_fx is None or base_fx is None:
        return derive(dict.fromkeys(FIELDS))
    price_current, price_base = price_context or (current, base)
    current_price = ratio(
        ratio(price_current["sales_amount"], current_fx), price_current["sales_qty"]
    )
    base_price = ratio(ratio(price_base["sales_amount"], base_fx), price_base["sales_qty"])
    price = current_price if current_price is not None else base_price
    for key in FIELDS:
        if key not in RMB_FIELDS and key not in {"sales_qty", "return_qty"}:
            value = base[key]
            result[key] = value / base_fx * current_fx if value is not None else None
    qty, refund = base["sales_qty"], base["return_amount"]
    result["sales_amount"] = (
        Decimal(0)
        if qty == 0
        else qty * price * current_fx
        if qty is not None and price is not None
        else None
    )
    result["return_amount"] = -abs(refund) / base_fx * current_fx if refund is not None else None
    return derive(result)


def comparison_rows(
    current: Amounts, base: Amounts, *, signed: bool = False
) -> list[CostComparison]:
    growth = ratio(
        (current["revenue"] - base["revenue"])
        if current["revenue"] is not None and base["revenue"] is not None
        else None,
        base["revenue"],
    )
    rows = []
    for key, label in COST_LABELS.items():
        raw_current, raw_base = current[key], base[key]
        left = (
            abs(raw_current) if raw_current is not None and key != "compensation" else raw_current
        )
        right = abs(raw_base) if raw_base is not None and key != "compensation" else raw_base
        if signed:
            # 业务组收支表保留冲回负号；退款桥仍沿用原费用负担绝对值口径。
            direction = 1 if key in DEDUCTED or key == "compensation" else -1
            left = raw_current * direction if raw_current is not None else None
            right = raw_base * direction if raw_base is not None else None
        rc = (
            ratio(left, current["revenue"])
            if current["revenue"] and current["revenue"] > 0
            else None
        )
        rb = ratio(right, base["revenue"]) if base["revenue"] and base["revenue"] > 0 else None
        delta = rc - rb if rc is not None and rb is not None else None
        elasticity, impact = None, None
        if growth is not None and left is not None and right is not None and right > 0:
            impact = (left - right * (1 + growth)) * (1 if key == "compensation" else -1)
            if abs(growth) >= Decimal("0.01"):
                elasticity = (left - right) / right / growth
        rows.append(
            CostComparison(
                key=key,
                label=label,
                current=text(left),
                base=text(right),
                current_rate=text(rc),
                base_rate=text(rb),
                delta=text(delta),
                elasticity=text(elasticity),
                profit_impact=text(impact),
                reason="" if delta is not None else "收入非正、缺少对比记录或还原依据不足",
                overview_expense=key in OVERVIEW_EXPENSE_KEYS,
                change_rate=text(
                    (left - right) / right
                    if left is not None and right is not None and right > 0
                    else None
                ),
                theoretical_amount=text(
                    right * (1 + growth) if right is not None and growth is not None else None
                ),
            )
        )
    return rows


def analyses(dataset: ReportDataset, filters: ReportFilter) -> list[BasisAnalysis]:
    report_periods = ReportPeriod(dataset.month).months
    facts = select_facts(dataset, filters)
    pools: dict[tuple[str, str, str], dict[str, list[OperatingFact]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for fact in facts:
        source = fact.source
        pools[source.group, source.site, source.listing][source.period].append(fact)
    full_pools: dict[tuple[str, str, str], dict[str, list[Amounts]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for fact in dataset.operating:
        source = fact.source
        full_pools[source.group, source.site, source.listing][source.period].append(fact.amounts)
    rates = exchange_rates(dataset)
    output = []
    for comparison, month in (("mom", report_periods[1]), ("yoy", report_periods[2])):
        for basis in ("actual", "price_adjusted", "price_refund_adjusted"):
            current_rows, base_rows = [], []
            for listing_key, periods in pools.items():
                _, site, listing = listing_key
                full = {period: aggregate(rows) for period, rows in full_pools[listing_key].items()}
                current = (
                    aggregate(fact.amounts for fact in periods[report_periods[0]])
                    if periods.get(report_periods[0])
                    else derive(dict.fromkeys(FIELDS, Decimal(0)))
                )
                base = (
                    aggregate(fact.amounts for fact in periods[month])
                    if periods.get(month)
                    else derive(dict.fromkeys(FIELDS, Decimal(0)))
                )
                raw_base = base
                current_fx, base_fx = rates.get((report_periods[0], site)), rates.get((month, site))
                if basis == "price_refund_adjusted":
                    if periods.get(report_periods[0]):
                        current = restore_listing(
                            dataset,
                            (site, listing),
                            report_periods[0],
                            [fact.amounts for fact in periods[report_periods[0]]],
                            full,
                        )
                    if periods.get(month):
                        base = restore_listing(
                            dataset,
                            (site, listing),
                            month,
                            [fact.amounts for fact in periods[month]],
                            full,
                        )
                if basis != "actual":
                    base = normalize_base(
                        base,
                        current,
                        current_fx,
                        base_fx,
                        (full.get(report_periods[0], current), full.get(month, base)),
                    )
                    if basis == "price_refund_adjusted" and periods.get(month):
                        # 原报告先剔价，再用标准化销售额还原佣金；明细备用金额只换汇。
                        commission_basis = normalize_base(
                            raw_base,
                            current,
                            current_fx,
                            base_fx,
                            (full.get(report_periods[0], current), full.get(month, raw_base)),
                        )
                        detail = identifiable_detail(
                            [fact.amounts for fact in periods[month]], "commission"
                        )
                        converted_detail = (
                            detail / base_fx * current_fx
                            if detail is not None and base_fx and current_fx
                            else None
                        )
                        base["commission"] = restore_commission(
                            commission_basis, fallback_commission(full, month), converted_detail
                        )
                        base = derive(base)
                current_rows.append(current)
                base_rows.append(base)
            current, base = aggregate(current_rows), aggregate(base_rows)
            indicators, scenarios = leverage(current, base)
            output.append(
                BasisAnalysis(
                    basis=basis,
                    comparison=comparison,
                    current=serialize(current),
                    base=serialize(base),
                    rows=comparison_rows(current, base),
                    business_rows=comparison_rows(current, base, signed=True),
                    unavailable_listings=sum(item["revenue"] is None for item in base_rows),
                    leverage=indicators,
                    scenarios=scenarios,
                )
            )
    for comparison in ("mom", "yoy"):
        selected = [item for item in output if item.comparison == comparison]
        deltas = {
            item.basis: {row.key: number(row.delta) for row in item.rows} for item in selected
        }
        bridges = cost_bridges(deltas, number(selected[0].current["revenue"]))
        for item in selected:
            item.bridges = bridges
    return output
