"""9月LISTING展示分支只作用于本模块，不改变经营总览合计。"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.inventory import InventoryRow
from app.schemas.listing import ListingIssue, select_issues
from app.schemas.reports import MetricRow, ReportFilter
from app.services.cost_analysis import analyses
from app.services.financial_model import FIELDS, number
from app.services.financial_report import breakdown, select_facts
from app.services.inventory_forecast import FutureRow, future_rows
from app.services.inventory_metrics import stock_row, turnover_rows
from app.services.inventory_readiness import all_readiness
from app.services.inventory_sources import InventoryFact, current_stock, matches
from app.services.listing_financial_issues import financial_issues, retired_profit_issues
from app.services.listing_inventory_issues import cleanup_issue, inventory_issues, stock_only_issues
from app.services.report_dataset import ReportDataset
from app.services.seasonal_risk import SeasonalRisk, seasonal_risk
from app.services.shipping_standards import shipping_identity

SEPTEMBER_NEW_LISTINGS = {"RGA102", "RG810", "RG811", "RG812", "RG813", "RG814", "RG815", "RG816"}
EXCLUDED_SITES = {"MX", "FR", "ES", "IT"}


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
    issues: list[ListingIssue] = []


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
    if position in {"废弃", "已停运", "停运"}:
        return "retired"
    if listing in SEPTEMBER_NEW_LISTINGS or group in {"HCM", "Ash"} and site == "UK":
        return "promotion"
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
    readiness = all_readiness(dataset, shipping_identity())
    turnover_by_listing: dict[tuple[str, str, str], list[InventoryFact]] = defaultdict(list)
    for item in turnover:
        if matches(item.dimensions, filters):
            turnover_by_listing[
                (item.dimensions["group"], item.dimensions["site"], item.dimensions["listing"])
            ].append(item)
    output = []
    for key in sorted(business.keys() | inventory.keys()):
        group, site, listing = key
        if site in EXCLUDED_SITES or group == "LZF" and site != "US":
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
        position = positions.get(key, "待补充")
        if listing in SEPTEMBER_NEW_LISTINGS and position not in {"废弃", "已停运", "停运"}:
            position = "新品"
        metrics = business.get(key)
        stock = stock_row(
            inventory[key], "|".join(key), dict(zip(("group", "site", "listing"), key, strict=True))
        )
        has_current = metrics is not None and metrics.record_count > 0
        # 有本期记录但字段缺失时继续保留核查，不能把缺失当作零而排除。
        has_activity = (
            has_current
            and metrics is not None
            and any(number(metrics.current.get(name)) != Decimal(0) for name in FIELDS)
        )
        has_stock = any(
            item.amounts.get(name) != Decimal(0)
            for item in inventory[key]
            for name in ("quantity", "amount", "age270")
        )
        if not has_current and not has_stock:
            continue
        mode = listing_mode(group, site, listing, position)
        if mode == "retired":
            if not has_activity and not has_stock:
                continue
            issues = retired_profit_issues(metrics) if has_activity else []
            if has_stock:
                issues.append(cleanup_issue(stock))
        elif metrics is None or not has_current:
            issues = stock_only_issues(
                stock, sorted({row.dimensions["warehouse"] for row in inventory[key]})
            )
        else:
            costs = analyses(dataset, selected)
            issues = select_issues(
                [
                    *financial_issues(metrics, costs),
                    *inventory_issues(
                        stock,
                        trend,
                        [row for row in readiness if matches(row.dimensions, selected)],
                    ),
                ]
            )
        output.append(
            ListingItem(
                key="|".join(key),
                group=group,
                site=site,
                listing=listing,
                position=position,
                mode=mode,
                issues=issues,
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
        source_note="常规LISTING归总3—5条结论；无经营记录但有库存的仅分析库存。停运、废弃仅保留本期利润侵蚀及待清库存，无本期事项不展示，特殊对象不凑条数。排除MX/FR/ES/IT，LZF仅保留US，仅作用于本模块。金额为人民币；剔价口径同时统一汇率。",
    )
