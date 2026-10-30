"""9月LISTING展示分支只作用于本模块，不改变经营总览合计。"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.reports import MetricRow, ReportFilter
from app.services.financial_model import number
from app.services.financial_report import breakdown, select_facts
from app.services.inventory_forecast import FutureRow, future_rows
from app.services.inventory_report import InventoryRow, stock_row, turnover_rows
from app.services.inventory_sources import InventoryFact, current_stock, matches
from app.services.report_dataset import ReportDataset
from app.services.seasonal_risk import SeasonalRisk, seasonal_risk

SEPTEMBER_NEW_LISTINGS = {"RGA102", "RG810", "RG811", "RG812", "RG813", "RG814", "RG815", "RG816"}
EXCLUDED_SITES = {"FR", "ES", "IT"}


class ListingItem(BaseModel):
    key: str
    group: str
    site: str
    listing: str
    position: str
    mode: Literal["full", "promotion", "retired", "mx"]
    business: MetricRow | None
    inventory: InventoryRow
    turnover: dict[str, str | None]
    future: list[FutureRow]
    stockout: str
    seasonal: SeasonalRisk


class ListingView(BaseModel):
    items: list[ListingItem]
    excluded_sites: list[str]
    source_note: str


def listing_positions(dataset: ReportDataset) -> dict[tuple[str, str, str], str]:
    pools: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for source in dataset.records("products"):
        position = source.raw.get("产品定位")
        if position:
            pools[source.group, source.site, source.listing].add(position)
    return {
        key: next(iter(values)) if len(values) == 1 else "定位冲突：" + "、".join(sorted(values))
        for key, values in pools.items()
    }


def listing_mode(
    group: str, site: str, listing: str, position: str
) -> Literal["full", "promotion", "retired", "mx"]:
    if listing in SEPTEMBER_NEW_LISTINGS or group in {"HCM", "Ash"} and site == "UK":
        return "promotion"
    if position in {"废弃", "已停运"}:
        return "retired"
    return "mx" if site == "MX" else "full"


def stockout_label(rows: list[FutureRow]) -> str:
    for row in rows:
        supported = number(row.support_days)
        if supported is not None and supported < row.calendar_days:
            day = min(row.calendar_days, max(1, int(supported) + 1))
            return f"{row.month}-{day:02}（按月需求均匀分布估算）"
    return "有效预测窗口内尚未耗尽" if rows else "无有效未来预测"


def listing_view(
    dataset: ReportDataset, filters: ReportFilter, turnover: list[InventoryFact]
) -> ListingView:
    financial = breakdown(select_facts(dataset, filters), "listings")
    business = {
        (row.dimensions["group"], row.dimensions["site"], row.dimensions["listing"]): row
        for row in financial
    }
    stocks = current_stock(dataset, filters)
    inventory: dict[tuple[str, str, str], list[InventoryFact]] = defaultdict(list)
    for item in stocks:
        inventory[
            (item.dimensions["group"], item.dimensions["site"], item.dimensions["listing"])
        ].append(item)
    positions = listing_positions(dataset)
    turnover_by_listing: dict[tuple[str, str, str], list[InventoryFact]] = defaultdict(list)
    for item in turnover:
        if matches(item.dimensions, filters):
            turnover_by_listing[
                (item.dimensions["group"], item.dimensions["site"], item.dimensions["listing"])
            ].append(item)
    output = []
    for key in sorted(business.keys() | inventory.keys()):
        group, site, listing = key
        if site in EXCLUDED_SITES:
            continue
        selected = ReportFilter(group=group, site=site, listing=listing)
        forecast, _ = future_rows(dataset, inventory[key], selected)
        basic = [row for row in forecast if row.scope == "所有仓库" and row.scenario == "基础"]
        trend = turnover_rows(turnover_by_listing[key], selected)
        september = next(
            (
                row.values
                for row in trend
                if row.dimensions == {"scope": "所有仓库", "month": "2026-09"}
            ),
            {},
        )
        position = "新品" if listing in SEPTEMBER_NEW_LISTINGS else positions.get(key, "待补充")
        metrics = business.get(key)
        stock = stock_row(
            inventory[key], "|".join(key), dict(zip(("group", "site", "listing"), key, strict=True))
        )
        has_business = metrics is not None and any(
            number(period.get(name)) not in {None, Decimal(0)}
            for period in (metrics.current, metrics.previous, metrics.year_ago)
            for name in ("revenue", "profit", "units", "purchase", "freight")
        )
        has_stock = number(stock.values.get("quantity")) not in {None, Decimal(0)}
        if not has_business and not has_stock:
            continue
        output.append(
            ListingItem(
                key="|".join(key),
                group=group,
                site=site,
                listing=listing,
                position=position,
                mode=listing_mode(group, site, listing, position),
                business=metrics,
                inventory=stock,
                turnover=september,
                future=basic,
                stockout=stockout_label(basic),
                seasonal=seasonal_risk(
                    dataset,
                    selected,
                    stock.values,
                    basic,
                    {
                        row.dimensions["month"]: row.values
                        for row in trend
                        if row.dimensions["scope"] == "所有仓库"
                    },
                ),
            )
        )
    return ListingView(
        items=output,
        excluded_sites=sorted(EXCLUDED_SITES),
        source_note="9月沿用原版新品/UK推广、停运废弃及MX简版，FR/ES/IT仅在本模块排除；公司经营合计保留全部站点。",
    )
