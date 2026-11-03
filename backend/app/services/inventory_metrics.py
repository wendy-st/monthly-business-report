"""库存分组与有符号流量周转的共用核算。"""

from __future__ import annotations

import calendar
from collections import defaultdict

from app.schemas.inventory import InventoryRow
from app.schemas.reports import ReportFilter
from app.services.financial_model import Amounts, combine, ratio, serialize
from app.services.inventory_sources import InventoryFact, matches, sum_amounts


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


def turnover_rows(
    facts: list[InventoryFact], filters: ReportFilter, *, available_months: set[str] | None = None
) -> list[InventoryRow]:
    selected = [item for item in facts if matches(item.dimensions, filters)]
    output = []
    for scope in ("所有仓库", "FBA+海外仓"):
        by_month: dict[str, list[InventoryFact]] = defaultdict(list)
        for item in selected:
            if scope == "所有仓库" or item.dimensions["warehouse"] != "本地仓":
                by_month[item.dimensions["month"]].append(item)
        monthly_values: dict[str, Amounts] = {}
        for month, items in sorted(by_month.items()):
            if month[:4] not in {"2025", "2026"} or month > "2026-09":
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
            # 来源期间完整时，对象无记录不等于来源缺失；原版按该对象有记录月份取均值。
            if available_months is not None and all(
                f"{year}-{month:02}" in available_months for month in range(1, 10)
            ):
                periods = [item for item in periods if item is not None]
            values = {}
            for suffix in ("qty", "purchase", "amount"):
                average = combine(
                    item.get(f"average_{suffix}") if item else None for item in periods
                )
                values[f"average_{suffix}"] = (
                    average / len(periods) if average is not None else None
                )
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
