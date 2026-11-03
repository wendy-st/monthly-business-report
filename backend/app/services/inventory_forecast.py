"""消费预测结果表，不重跑预测上游；库存起点仅取经营库存。"""

from __future__ import annotations

import calendar
from collections import defaultdict
from decimal import Decimal
from functools import lru_cache

from app.schemas.inventory import FutureRow as FutureRow
from app.schemas.reports import ReportFilter
from app.services.financial_model import ZERO, group_name, number
from app.services.inventory_sources import InventoryFact, inventory_categories, matches, sum_amounts
from app.services.inventory_styles import forecast_style
from app.services.report_dataset import ReportDataset


@lru_cache(maxsize=1)
def forecast_categories(dataset: ReportDataset) -> dict[tuple[str, str], set[tuple[str, str, str]]]:
    categories: dict[tuple[str, str], set[tuple[str, str, str]]] = defaultdict(set)
    for source in dataset.records("current_inventory") + dataset.records("operating"):
        if source.period == dataset.month:
            mapped = inventory_categories(dataset).get((source.site, source.listing), {})
            path = tuple(
                mapped.get(field, getattr(source, field))
                for field in ("category1", "category2", "category3")
            )
            if any(path):
                categories[source.site, source.msku].add(path)
    return dict(categories)


@lru_cache(maxsize=1)
def forecast_records(
    dataset: ReportDataset,
) -> tuple[list[tuple[dict[str, str], dict[str, Decimal | None]]], int]:
    mapping: dict[tuple[str, str, str], set[tuple[str, str]]] = defaultdict(set)
    for source in dataset.records("forecast_mapping"):
        raw = source.raw
        key = (raw.get("负责人") or "", source.site, source.listing)
        target_group = group_name(raw.get("对应经营月报的小组字段"))
        target_listing = raw.get("对应经营月报的小组字段LISTING") or source.listing
        if target_group:
            mapping[key].add((target_group, target_listing))
    records = []
    unmatched = 0
    for source in dataset.records("forecast"):
        group, status = dataset.resolve(dataset.month, source.site, source.msku)
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
            "style": forecast_style(dataset, source.site, listing, source.sku),
            "sku": source.sku,
            "msku": source.msku,
        }
        paths = forecast_categories(dataset).get((source.site, source.msku), set())
        if len(paths) == 1:
            dimensions.update(
                zip(("category1", "category2", "category3"), next(iter(paths)), strict=True)
            )
        amounts: dict[str, Decimal | None] = {}
        for field, value in source.raw.items():
            if not field.endswith("月") or not field.removesuffix("月").replace("年", "").isdigit():
                continue
            if "年" in field:
                year, monthly = field.removesuffix("月").split("年")
                month = f"{int(year):04}-{int(monthly):02}"
            else:
                month = f"{dataset.month[:4]}-{int(field.removesuffix('月')):02}"
            demand = number(value)
            amounts[month] = max(demand, ZERO) if demand is not None else None
        records.append((dimensions, amounts))
    return records, unmatched


def forecast_amounts(
    dataset: ReportDataset,
    filters: ReportFilter,
    *,
    future_only: bool = True,
    allowed_listings: set[tuple[str, str, str]] | None = None,
) -> tuple[dict[str, Decimal | None], int]:
    records, unmatched = forecast_records(dataset)
    output: dict[str, Decimal | None] = {}
    for dimensions, amounts in records:
        if (
            allowed_listings is not None
            and tuple(dimensions[key] for key in ("group", "site", "listing"))
            not in allowed_listings
        ):
            continue
        if (filters.category1 or filters.category2 or filters.category3) and not dimensions[
            "category3"
        ]:
            if not filters.group or dimensions["group"] == filters.group:
                unmatched += 1
            continue
        if not matches(dimensions, filters):
            continue
        for month, demand in amounts.items():
            if future_only and month <= dataset.month:
                continue
            if demand is None or (month in output and output[month] is None):
                output[month] = None
            else:
                output[month] = (output.get(month) or ZERO) + demand
    if not future_only:
        return dict(sorted(output.items())), unmatched
    positive = [month for month, demand in output.items() if demand is not None and demand > 0]
    if not positive:
        return {}, unmatched
    return {month: output[month] for month in sorted(output) if month <= max(positive)}, unmatched


def consume_month(
    remaining: Decimal | None, demand: Decimal | None, days: int
) -> tuple[Decimal | None, Decimal | None]:
    """所有覆盖指标共用逐月扣减，月内按预测日均需求折算。"""
    if remaining is None or demand is None:
        return None, None
    supported = (
        Decimal(days) if demand == 0 else min(Decimal(days), max(remaining, ZERO) / demand * days)
    )
    return supported, max(remaining - demand, ZERO)


def covered_days(
    quantity: Decimal | None, forecast: dict[str, Decimal | None]
) -> tuple[Decimal | None, bool]:
    """首次不足日结束；窗口末仍有余量时只报告已验证的覆盖下限。"""
    positive = [month for month, demand in forecast.items() if demand is not None and demand > 0]
    if not positive or quantity is None:
        return None, False
    end = max(positive)
    remaining: Decimal | None = quantity
    total = Decimal(0)
    for month in sorted(month for month in forecast if month <= end):
        year, monthly = map(int, month.split("-"))
        days = calendar.monthrange(year, monthly)[1]
        supported, remaining = consume_month(remaining, forecast[month], days)
        if supported is None or remaining is None:
            return None, False
        total += supported
        if supported < days:
            return total, False
    return total, remaining is not None and remaining > 0


def future_rows(
    dataset: ReportDataset,
    stocks: list[InventoryFact],
    filters: ReportFilter,
    *,
    allowed_listings: set[tuple[str, str, str]] | None = None,
) -> tuple[list[FutureRow], int]:
    demand, unmatched = forecast_amounts(dataset, filters, allowed_listings=allowed_listings)
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
                supported, remaining = consume_month(remaining, monthly_demand, days)
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
