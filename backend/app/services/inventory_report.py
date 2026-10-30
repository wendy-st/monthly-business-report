"""库存结构、库龄、同期与累计周转的服务端权威汇总。"""

from __future__ import annotations

import calendar
from collections import defaultdict
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.reports import ReportFilter
from app.services.financial_model import Amounts, combine, ratio, serialize
from app.services.inventory_forecast import FutureRow, future_rows
from app.services.inventory_sources import (
    InventoryFact,
    current_stock,
    matches,
    sum_amounts,
    turnover_facts,
)
from app.services.report_dataset import ReportDataset
from app.services.seasonal_risk import SeasonalRisk, seasonal_risk


class InventoryRow(BaseModel):
    key: str
    label: str
    dimensions: dict[str, str]
    values: dict[str, str | None]
    source_rows: list[int]


class InventoryView(BaseModel):
    summary: InventoryRow
    breakdowns: dict[str, list[InventoryRow]]
    turnover: list[InventoryRow]
    future: list[FutureRow]
    warnings: list[str]
    source_note: str
    seasonal: list[InventoryRisk]


class InventoryRisk(BaseModel):
    key: str
    label: str
    risk: SeasonalRisk


InventoryView.model_rebuild()


def inventory_risks(
    dataset: ReportDataset, stocks: list[InventoryFact], turnover: list[InventoryFact]
) -> list[InventoryRisk]:
    pools: dict[str, list[InventoryFact]] = defaultdict(list)
    for item in turnover:
        pools["|".join(item.dimensions[name] for name in ("group", "site", "listing"))].append(item)
    output = []
    for row in stock_groups(stocks, ("group", "site", "listing")):
        filters = ReportFilter(
            group=row.dimensions["group"],
            site=row.dimensions["site"],
            listing=row.dimensions["listing"],
        )
        forecast, _ = future_rows(
            dataset, [item for item in stocks if matches(item.dimensions, filters)], filters
        )
        basic = [item for item in forecast if item.scope == "所有仓库" and item.scenario == "基础"]
        trend = {
            item.dimensions["month"]: item.values
            for item in turnover_rows(pools[row.key], filters)
            if item.dimensions["scope"] == "所有仓库"
        }
        output.append(
            InventoryRisk(
                key=row.key,
                label=row.label,
                risk=seasonal_risk(dataset, filters, row.values, basic, trend),
            )
        )
    return sorted(output, key=lambda item: item.risk.score, reverse=True)


def stock_row(facts: list[InventoryFact], key: str, dimensions: dict[str, str]) -> InventoryRow:
    values = sum_amounts(facts)
    for name in ("age180", "age270"):
        values[f"{name}_rate"] = ratio(values.get(name), values.get("in_stock"))
    return InventoryRow(
        key=key,
        label=" / ".join(dimensions.values()) or "总计",
        dimensions=dimensions,
        values=serialize(values),
        source_rows=[item.source.row for item in facts],
    )


def stock_groups(facts: list[InventoryFact], names: tuple[str, ...]) -> list[InventoryRow]:
    grouped: dict[tuple[str, ...], list[InventoryFact]] = defaultdict(list)
    for item in facts:
        grouped[tuple(item.dimensions[name] for name in names)].append(item)
    return [
        stock_row(items, "|".join(key), dict(zip(names, key, strict=True)))
        for key, items in sorted(grouped.items())
    ]


def add_turnover(values: Amounts, days: int) -> Amounts:
    for suffix in ("qty", "purchase", "amount"):
        flow = values.get(f"flow_{suffix}")
        average = values.get(f"average_{suffix}")
        values[f"days_{suffix}"] = ratio(
            average * days if average is not None else None,
            abs(flow) if flow is not None else None,
        )
    return values


def turnover_rows(facts: list[InventoryFact], filters: ReportFilter) -> list[InventoryRow]:
    selected = [item for item in facts if matches(item.dimensions, filters)]
    output = []
    for scope in ("所有仓库", "FBA+海外仓"):
        by_month: dict[str, list[InventoryFact]] = defaultdict(list)
        for item in selected:
            if scope == "所有仓库" or item.dimensions["warehouse"] != "本地仓":
                by_month[item.dimensions["month"]].append(item)
        monthly_values: dict[str, Amounts] = {}
        for month, items in sorted(by_month.items()):
            if month[:4] not in {"2025", "2026"} or month[5:] > "09":
                continue
            year, monthly = map(int, month.split("-"))
            values = add_turnover(sum_amounts(items), calendar.monthrange(year, monthly)[1])
            monthly_values[month] = values
            output.append(
                InventoryRow(
                    key=f"{scope}|{month}",
                    label=month,
                    dimensions={"scope": scope, "month": month},
                    values=serialize(values),
                    source_rows=[],
                )
            )
        for year in (2025, 2026):
            periods = [monthly_values.get(f"{year}-{month:02}") for month in range(1, 10)]
            values = {}
            for suffix in ("qty", "purchase", "amount"):
                average = combine(
                    item.get(f"average_{suffix}") if item else None for item in periods
                )
                values[f"average_{suffix}"] = average / 9 if average is not None else None
                values[f"flow_{suffix}"] = combine(
                    item.get(f"flow_{suffix}") if item else None for item in periods
                )
            days = sum(calendar.monthrange(year, month)[1] for month in range(1, 10))
            output.append(
                InventoryRow(
                    key=f"{scope}|{year}-YTD",
                    label=f"{year}年1—9月累计",
                    dimensions={"scope": scope, "month": f"{year}-YTD"},
                    values=serialize(add_turnover(values, days)),
                    source_rows=[],
                )
            )
    return output


def inventory_view(
    dataset: ReportDataset, filters: ReportFilter, turnover: list[InventoryFact]
) -> InventoryView:
    stocks = current_stock(dataset, filters)
    future, unmatched = future_rows(dataset, stocks, filters)
    breakdowns = {
        name: stock_groups(stocks, names)
        for name, names in {
            "warehouses": ("warehouse",),
            "groups": ("group",),
            "categories": ("category1",),
            "category_warehouses": ("category1", "warehouse"),
            "category3": ("category1", "category2", "category3"),
            "listings": ("group", "site", "listing"),
            "age": ("group", "site", "listing", "sku", "msku"),
        }.items()
    }
    breakdowns["age"] = [
        row
        for row in breakdowns["age"]
        if row.values.get("age180") is not None and Decimal(row.values["age180"] or "0") > 0
    ]
    totals = sum_amounts(stocks)
    for name in ("warehouses", "categories", "category3", "listings"):
        for row in breakdowns[name]:
            for field in ("quantity", "amount"):
                raw_value = row.values.get(field)
                value = Decimal(raw_value) if raw_value is not None else None
                share = ratio(value, totals.get(field))
                row.values[f"{field}_share"] = str(share) if share is not None else None
    warnings = [
        "库存规模、金额、结构、库龄和预测起点均取经营工作簿；周转天数单独取两年周转表，金额不要求两源一致。"
    ]
    if unmatched:
        warnings.append(
            f"预测表有{unmatched}行未取得唯一参考归属，未纳入未来需求；未来支持结果的覆盖尚不完整。"
        )
    return InventoryView(
        summary=stock_row(stocks, "summary", {}),
        breakdowns=breakdowns,
        turnover=turnover_rows(turnover, filters),
        future=future,
        warnings=warnings,
        source_note="经营工作簿：库存数据；周转：2025/2026库存周转表",
        seasonal=inventory_risks(dataset, stocks, turnover),
    )


def build_turnover(dataset: ReportDataset) -> list[InventoryFact]:
    return turnover_facts(dataset)
