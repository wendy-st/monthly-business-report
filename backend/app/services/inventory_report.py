"""库存结构、库龄、同期与累计周转的服务端权威汇总。"""

from __future__ import annotations

from decimal import Decimal

from app.schemas.inventory import InventoryView
from app.schemas.reports import ReportFilter
from app.services.financial_model import ratio
from app.services.inventory_assessment import active_listings, listing_key
from app.services.inventory_details import (
    category_warehouse_shares,
    inventory_kpis,
    turnover_details,
)
from app.services.inventory_forecast import future_rows
from app.services.inventory_metrics import (
    add_turnover as add_turnover,
)
from app.services.inventory_metrics import (
    stock_groups,
)
from app.services.inventory_metrics import (
    stock_row as stock_row,
)
from app.services.inventory_metrics import (
    turnover_rows as turnover_rows,
)
from app.services.inventory_seasonal import group_season, season_rows
from app.services.inventory_sources import (
    InventoryFact,
    current_stock,
    matches,
    sum_amounts,
)
from app.services.inventory_turnover import build_turnover as build_turnover
from app.services.report_dataset import ReportDataset


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
    # SKU定位字段来自原始库存行，不从产品名称推断。
    for row in breakdowns["age"]:
        source = next(
            item
            for item in stocks
            if all(item.dimensions[name] == value for name, value in row.dimensions.items())
        )
        row.dimensions.update(
            {name: source.dimensions[name] for name in ("asin", "fnsku", "product_name")}
        )
    breakdowns["age_listings"] = [
        row
        for row in stock_groups(stocks, ("group", "site", "listing"))
        if Decimal(row.values.get("age180") or "0") > 0
    ]
    totals = sum_amounts(stocks)
    for name in ("warehouses", "categories", "category3", "listings"):
        for row in breakdowns[name]:
            for field in ("quantity", "amount"):
                raw_value = row.values.get(field)
                value = Decimal(raw_value) if raw_value is not None else None
                share = ratio(value, totals.get(field))
                row.values[f"{field}_share"] = str(share) if share is not None else None
    category_warehouse_shares(breakdowns["category_warehouses"], breakdowns["categories"])
    for name, names in {
        "group_turnover": ("group",),
        "listing_turnover": ("group", "site", "listing"),
        "category_turnover": ("category1", "category2", "category3"),
    }.items():
        breakdowns[name] = turnover_details(
            dataset, turnover, stocks, filters, names, group_shares=name == "group_turnover"
        )
    # 原版三级品类结构仅统计FBA+海外仓，两种占比各自使用完整分母。
    category_stocks = [item for item in stocks if item.dimensions["warehouse"] != "本地仓"]
    breakdowns["category3"] = stock_groups(category_stocks, ("category1", "category2", "category3"))
    category_totals = sum_amounts(category_stocks)
    for row in breakdowns["category3"]:
        for field in ("quantity", "amount"):
            share = ratio(
                Decimal(raw) if (raw := row.values.get(field)) is not None else None,
                category_totals.get(field),
            )
            row.values[f"{field}_share"] = str(share) if share is not None else None
    breakdowns["category3"].sort(
        key=lambda row: Decimal(row.values.get("quantity") or "0"), reverse=True
    )
    trend = turnover_rows(turnover, filters)
    kpis = inventory_kpis(trend)
    active = active_listings(dataset)
    seasonal_stocks = [item for item in stocks if listing_key(item.dimensions) in active]
    seasonal_facts = [
        item
        for item in turnover
        if matches(item.dimensions, filters) and listing_key(item.dimensions) in active
    ]
    seasonal = (
        season_rows(
            dataset, seasonal_stocks, seasonal_facts, ("group", "site", "listing"), filters=filters
        )
        if filters.group
        else []
    )
    styles = (
        season_rows(
            dataset,
            seasonal_stocks,
            seasonal_facts,
            ("group", "site", "listing", "style"),
            filters=filters,
        )
        if filters.group
        else []
    )
    choices = [
        item
        for item in current_stock(dataset, ReportFilter(group=filters.group))
        if not filters.group or listing_key(item.dimensions) in active
    ]
    options = {
        name: sorted({item.dimensions[name] for item in choices if item.dimensions[name]})
        for name in ("site", "listing", "category3")
    }
    warnings = ["当期期末库存取经营底表；期初取上月基础库存，进销存流量保留原符号汇总后取绝对值。"]
    if unmatched:
        warnings.append(
            f"预测表有{unmatched}行未取得唯一参考归属，未纳入未来需求；未来支持结果的覆盖尚不完整。"
        )
    return InventoryView(
        summary=stock_row(stocks, "summary", {}),
        breakdowns=breakdowns,
        turnover=trend,
        future=future,
        warnings=warnings,
        source_note="来源：经营工作簿库存数据及产品基础信息、2025/2026库存周转表、MSKU销量预估表、库存发货天数表。库存状况按在售LISTING/款式汇总核算，标准天数按源表SKU等权平均向上取整；270天以上占比仅统计FBA在库。",
        seasonal=seasonal,
        seasonal_styles=styles,
        seasonal_group=group_season(
            dataset,
            seasonal_stocks,
            seasonal_facts,
            filters.group,
            seasonal,
            styles,
            filters=filters,
        ),
        kpis=kpis,
        options=options,
        conclusions=[
            f"截至2026-09，所有仓库库存数量{Decimal(kpis[1].current or '0'):,.0f}件、"
            f"库存资金{Decimal(kpis[0].current or '0') / 10000:,.1f}万元。",
            f"9月所有仓库周转{Decimal(kpis[2].current or '0'):.1f}天，"
            f"FBA+海外仓周转{Decimal(kpis[3].current or '0'):.1f}天。",
            "未来支持天数按无新增补货、预测销量逐月扣减测算。",
        ]
        if stocks
        else ["当前筛选没有当期库存记录。"],
    )
