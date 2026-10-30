"""消费预测结果表，不重跑预测上游；库存起点仅取经营库存。"""

from __future__ import annotations

import calendar
from collections import defaultdict
from decimal import Decimal
from functools import lru_cache

from pydantic import BaseModel

from app.schemas.reports import ReportFilter
from app.services.financial_model import ZERO, group_name, number
from app.services.inventory_sources import InventoryFact, matches, sum_amounts
from app.services.report_dataset import ReportDataset


class FutureRow(BaseModel):
    month: str
    scope: str
    scenario: str
    demand: str | None
    remaining: str | None
    support_days: str | None
    calendar_days: int


@lru_cache(maxsize=1)
def forecast_categories(dataset: ReportDataset) -> dict[tuple[str, str], set[tuple[str, str, str]]]:
    categories: dict[tuple[str, str], set[tuple[str, str, str]]] = defaultdict(set)
    for source in dataset.records("current_inventory") + dataset.records("operating"):
        if source.period == "2026-09":
            path = (source.category1, source.category2, source.category3)
            if any(path):
                categories[source.site, source.msku].add(path)
    return dict(categories)


def forecast_amounts(
    dataset: ReportDataset, filters: ReportFilter, *, future_only: bool = True
) -> tuple[dict[str, Decimal | None], int]:
    mapping: dict[tuple[str, str, str], set[tuple[str, str]]] = defaultdict(set)
    for source in dataset.records("forecast_mapping"):
        raw = source.raw
        key = (raw.get("负责人") or "", source.site, source.listing)
        target_group = group_name(raw.get("对应经营月报的小组字段"))
        target_listing = raw.get("对应经营月报的小组字段LISTING") or source.listing
        if target_group:
            mapping[key].add((target_group, target_listing))
    output: dict[str, Decimal | None] = {}
    unmatched = 0
    for source in dataset.records("forecast"):
        group, status = dataset.resolve("2026-09", source.site, source.msku)
        reference = mapping.get(
            (source.raw.get("负责人") or "", source.site, source.listing), set()
        )
        listing = source.listing
        if len(reference) == 1:
            reference_group, listing = next(iter(reference))
            if not group and status != "RESPONSIBILITY_CONFLICT":
                group = reference_group
        if not group:
            unmatched += 1
            continue
        dimensions = {
            "group": group,
            "site": source.site,
            "listing": listing,
            "category1": "",
            "category2": "",
            "category3": "",
        }
        paths = forecast_categories(dataset).get((source.site, source.msku), set())
        if len(paths) == 1:
            dimensions.update(
                zip(("category1", "category2", "category3"), next(iter(paths)), strict=True)
            )
        elif filters.category1 or filters.category2 or filters.category3:
            if not filters.group or group == filters.group:
                unmatched += 1
            continue
        if not matches(dimensions, filters):
            continue
        for field, value in source.raw.items():
            if not field.endswith("月") or not field.removesuffix("月").replace("年", "").isdigit():
                continue
            if "年" in field:
                year, monthly = field.removesuffix("月").split("年")
                month = f"{int(year):04}-{int(monthly):02}"
            else:
                month = f"2026-{int(field.removesuffix('月')):02}"
            if future_only and month <= "2026-09":
                continue
            demand = number(value)
            if demand is None or (month in output and output[month] is None):
                output[month] = None
            else:
                output[month] = (output.get(month) or ZERO) + max(demand, ZERO)
    if not future_only:
        return dict(sorted(output.items())), unmatched
    positive = [month for month, demand in output.items() if demand is not None and demand > 0]
    if not positive:
        return {}, unmatched
    return {month: output[month] for month in sorted(output) if month <= max(positive)}, unmatched


def future_rows(
    dataset: ReportDataset, stocks: list[InventoryFact], filters: ReportFilter
) -> tuple[list[FutureRow], int]:
    demand, unmatched = forecast_amounts(dataset, filters)
    rows = []
    for scope in ("所有仓库", "FBA+海外仓"):
        selected = [
            item
            for item in stocks
            if scope == "所有仓库" or item.dimensions["warehouse"] != "本地仓"
        ]
        stock = sum_amounts(selected).get("quantity")
        for label, multiplier in (
            ("需求+15%", Decimal("1.15")),
            ("基础", Decimal(1)),
            ("需求-15%", Decimal("0.85")),
        ):
            remaining = stock
            for month, quantity in demand.items():
                year, monthly = map(int, month.split("-"))
                days = calendar.monthrange(year, monthly)[1]
                monthly_demand = quantity * multiplier if quantity is not None else None
                supported = None
                if remaining is not None and monthly_demand is not None:
                    supported = (
                        Decimal(days)
                        if monthly_demand == 0
                        else min(Decimal(days), max(remaining, ZERO) / monthly_demand * days)
                    )
                    remaining = max(remaining - monthly_demand, ZERO)
                else:
                    remaining = None
                rows.append(
                    FutureRow(
                        month=month,
                        scope=scope,
                        scenario=label,
                        demand=str(monthly_demand) if monthly_demand is not None else None,
                        remaining=str(remaining) if remaining is not None else None,
                        support_days=str(supported) if supported is not None else None,
                        calendar_days=days,
                    )
                )
    return rows, unmatched
