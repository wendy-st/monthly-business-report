"""库存KPI和小组、品类、站点LISTING明细，统一在汇总后核算。"""

from collections import defaultdict
from decimal import Decimal

from app.schemas.inventory import InventoryKpi, InventoryRow
from app.schemas.reports import ReportFilter
from app.services.financial_model import number, ratio, serialize
from app.services.inventory_metrics import stock_groups, turnover_rows
from app.services.inventory_sources import InventoryFact, current_stock, matches, sum_amounts
from app.services.report_dataset import ReportDataset
from app.services.report_period import BASELINE_MONTH, ReportPeriod


def difference(current: str | None, previous: str | None) -> Decimal | None:
    left, right = number(current), number(previous)
    return left - right if left is not None and right is not None else None


def inventory_kpis(rows: list[InventoryRow], month: str = BASELINE_MONTH) -> list[InventoryKpi]:
    output = []
    for label, unit, scope, field in (
        ("库存资金", "万元", "所有仓库", "end_amount"),
        ("库存数量", "件", "所有仓库", "end_qty"),
        ("总库存周转天数", "天", "所有仓库", "days_qty"),
        ("FBA+海外仓周转天数", "天", "FBA+海外仓", "days_qty"),
    ):
        values = {
            row.dimensions["month"]: row.values.get(field)
            for row in rows
            if row.dimensions["scope"] == scope
        }
        current, previous, year_ago = (values.get(month) for month in ReportPeriod(month).months)
        changes = []
        for base in (previous, year_ago):
            delta = difference(current, base)
            change = delta if unit == "天" else ratio(delta, number(base))
            changes.append(str(change) if change is not None else None)
        output.append(
            InventoryKpi(
                label=label,
                unit=unit,
                current=current,
                previous=previous,
                year_ago=year_ago,
                mom=changes[0],
                yoy=changes[1],
            )
        )
    return output


def turnover_details(
    dataset: ReportDataset,
    facts: list[InventoryFact],
    stocks: list[InventoryFact],
    filters: ReportFilter,
    names: tuple[str, ...],
    *,
    group_shares: bool = False,
) -> list[InventoryRow]:
    selected = [
        item
        for item in facts
        if matches(item.dimensions, filters) and item.dimensions["warehouse"] != "本地仓"
    ]
    pools: dict[tuple[str, ...], list[InventoryFact]] = defaultdict(list)
    for item in selected:
        pools[tuple(item.dimensions[name] for name in names)].append(item)
    selected_stocks = [item for item in stocks if item.dimensions["warehouse"] != "本地仓"]
    available_months = {item.dimensions["month"] for item in facts}
    rows = stock_groups(selected_stocks, names)
    sales: dict[tuple[str, ...], Decimal | None] = {}
    for fact in dataset.operating:
        source = fact.source
        dimensions = {
            "group": source.group,
            "site": source.site,
            "listing": source.listing,
            "category1": source.category1,
            "category2": source.category2,
            "category3": source.category3,
            "style": source.style,
        }
        if source.period == dataset.month and matches(dimensions, filters):
            key = tuple(dimensions[name] for name in names)
            # 沿用原报告经营销量列：销量加退货数量；周转分母仍独立取进销存净流量。
            sold, returned = fact.amounts.get("sales_qty"), fact.amounts.get("return_qty")
            value = sold + returned if sold is not None and returned is not None else None
            sales[key] = (sales.get(key) or Decimal(0)) + value if value is not None else None
    denominator_stocks = current_stock(dataset, ReportFilter(group=filters.group))
    denominator = sum_amounts(
        [item for item in denominator_stocks if item.dimensions["warehouse"] != "本地仓"]
    )
    for row in rows:
        key = tuple(row.dimensions[name] for name in names)
        trend = {
            item.dimensions["month"]: item.values
            for item in turnover_rows(
                pools[key], ReportFilter(), available_months=available_months, month=dataset.month
            )
            if item.dimensions["scope"] == "FBA+海外仓"
        }
        current = trend.get(dataset.month, {})
        values = {**row.values, **current}
        quantity = sales.get(key, Decimal(0))
        values["sales_units"] = str(quantity) if quantity is not None else None
        values["ytd_days_qty"] = trend.get(f"{dataset.month[:4]}-YTD", {}).get("days_qty")
        for name, month in (
            ("mom", ReportPeriod(dataset.month).months[1]),
            ("yoy", ReportPeriod(dataset.month).months[2]),
        ):
            change = difference(current.get("days_qty"), trend.get(month, {}).get("days_qty"))
            values[f"{name}_days_qty"] = str(change) if change is not None else None
        for field in ("quantity", "amount", "purchase", "freight"):
            base = denominator.get("quantity" if field == "quantity" else "amount")
            if field in {"purchase", "freight"} and not group_shares:
                base = number(row.values.get("amount"))
            share = ratio(number(row.values.get(field)), base)
            values[f"{field}_share"] = str(share) if share is not None else None
        row.values = values
    return sorted(
        rows, key=lambda row: number(row.values.get("amount")) or Decimal(0), reverse=True
    )


def category_warehouse_shares(rows: list[InventoryRow], categories: list[InventoryRow]) -> None:
    quantities = {
        row.dimensions["category1"]: number(row.values.get("quantity")) for row in categories
    }
    for row in rows:
        row.values.update(
            serialize(
                {
                    "quantity_share": ratio(
                        number(row.values.get("quantity")),
                        quantities.get(row.dimensions["category1"]),
                    )
                }
            )
        )
