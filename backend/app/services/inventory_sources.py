"""经营库存及基础周转来源适配；当期覆盖见inventory_turnover。"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache

from app.schemas.reports import ReportFilter
from app.services.financial_model import Amounts, combine, number
from app.services.inventory_styles import style_name
from app.services.report_dataset import ReportDataset
from app.services.report_period import shift_month as shift_month
from app.services.source_import import SourceRecord

WAREHOUSES = {"FBA仓", "海外仓", "本地仓"}


@dataclass
class InventoryFact:
    dimensions: dict[str, str]
    amounts: Amounts
    source: SourceRecord


@lru_cache(maxsize=1)
def inventory_categories(dataset: ReportDataset) -> dict[tuple[str, str], dict[str, str]]:
    pools: dict[tuple[str, str], dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for source in dataset.records("products"):
        for field in ("category1", "category2", "category3"):
            value = getattr(source, field)
            if value and value != "未匹配":
                pools[source.site, source.listing][field].add(value)
    return {
        key: {field: next(iter(values)) for field, values in fields.items() if len(values) == 1}
        for key, fields in pools.items()
    }


def inventory_dimensions(dataset: ReportDataset, source: SourceRecord) -> dict[str, str]:
    group, status = dataset.external_group(source)
    if group == "KAYO":
        group = "KAYO-北美" if source.site in {"US", "CA", "MX"} else "KAYO-欧日"
    if (
        group == "JASON"
        and source.site in {"US", "MX"}
        and source.listing in {"SK001", "SK002", "SWS001", "SWS002"}
    ):
        group = "薄底水鞋"
    return {
        "group": group,
        "site": source.site,
        "listing": source.listing,
        "category1": source.category1,
        "category2": source.category2,
        "category3": source.category3,
        "warehouse": source.raw.get("所属仓") or "FBA仓",
        "assignment": status,
        "month": source.period,
        "sku": source.sku,
        "msku": source.msku,
        # 当期补充映射不追溯覆盖历史空款式，保留原报告历史聚合口径。
        "style": source.style
        or (
            style_name(dataset, source.site, source.listing, source.sku, source.msku)
            if source.period == dataset.month
            else ""
        ),
        "asin": source.raw.get("ASIN") or "",
        "fnsku": source.raw.get("FNSKU") or "",
        "product_name": source.raw.get("产品名称") or "",
        **inventory_categories(dataset).get((source.site, source.listing), {}),
    }


def matches(values: dict[str, str], filters: ReportFilter) -> bool:
    return all(
        not getattr(filters, key) or getattr(filters, key) == values[key]
        for key in ("group", "site", "listing", "category1", "category2", "category3", "style")
    )


def current_stock(dataset: ReportDataset, filters: ReportFilter) -> list[InventoryFact]:
    result = []
    for source in dataset.records("current_inventory"):
        values = inventory_dimensions(dataset, source)
        if source.period != dataset.month or not matches(values, filters):
            continue
        if values["warehouse"] not in WAREHOUSES:
            continue
        raw = source.raw
        # 同步状态异常的FBA记录不属于本次应统计库存，整条剔除。
        if values["warehouse"] == "FBA仓" and raw.get("同步状态") == "异常":
            continue
        amounts = {
            key: number(raw.get(field))
            for key, field in {
                "quantity": "总库存",
                "purchase": "总采购成本",
                "freight": "总头程成本",
                "in_stock": "在库量",
                "age181": "181~270",
                "age271": "271~330",
                "age331": "331~365",
                "age365": "365+",
            }.items()
        }
        amounts["amount"] = combine([amounts["purchase"], amounts["freight"]])
        amounts["age180"] = combine(
            amounts[key] for key in ("age181", "age271", "age331", "age365")
        )
        amounts["age270"] = combine(amounts[key] for key in ("age271", "age331", "age365"))
        if values["warehouse"] != "FBA仓":
            for key in ("in_stock", "age180", "age270", "age181", "age271", "age331", "age365"):
                amounts[key] = Decimal(0)
        result.append(InventoryFact(values, amounts, source))
    return result


def turnover_source_amounts(source: SourceRecord) -> Amounts:
    raw = source.raw
    if "FBA" not in source.sheet:
        purchase = number(raw.get("总采购成本"))
        freight = number(raw.get("总头程成本"))
        return {
            "end_qty": number(raw.get("总库存")),
            "end_purchase": purchase,
            "end_amount": number(raw.get("总货值")),
            "transit_qty": Decimal(0),
            "transit_purchase": Decimal(0),
            "transit_amount": Decimal(0),
            "base_begin_qty": None,
            "base_begin_purchase": None,
            "base_begin_amount": None,
            "flow_qty": Decimal(0),
            "flow_purchase": Decimal(0),
            "flow_amount": Decimal(0),
            "end_freight": freight,
        }
    fields = {
        "end_qty": ("期末库存(含转运中)数量", "FBA在途数量"),
        "end_purchase": ("期末库存(含转运中)采购成本", "FBA在途采购成本"),
        "end_amount": ("期末库存(含转运中)总成本", "FBA在途总成本"),
        "flow_qty": ("订单发货数量", "买家退货数量"),
        "flow_purchase": ("订单发货采购成本", "买家退货采购成本"),
        "flow_amount": ("订单发货总成本", "买家退货总成本"),
    }
    result = {
        key: combine(number(raw.get(field)) for field in names) for key, names in fields.items()
    }
    for key, field in {
        "transit_qty": "FBA在途数量",
        "transit_purchase": "FBA在途采购成本",
        "transit_amount": "FBA在途总成本",
        "base_begin_qty": "期初含转运中数量",
        "base_begin_purchase": "期初含转运中采购成本",
        "base_begin_amount": "期初含转运中总成本",
    }.items():
        result[key] = number(raw.get(field))
    return result


def sum_amounts(facts: list[InventoryFact]) -> Amounts:
    keys = {key for fact in facts for key in fact.amounts}
    return {key: combine(fact.amounts.get(key) for fact in facts) for key in keys}


def turnover_facts(dataset: ReportDataset) -> list[InventoryFact]:
    names = (
        "month",
        "warehouse",
        "group",
        "site",
        "category1",
        "category2",
        "category3",
        "listing",
        "style",
        "sku",
        "msku",
    )
    pools: dict[tuple[str, ...], list[InventoryFact]] = defaultdict(list)
    for source in dataset.records("inventory"):
        dimensions = inventory_dimensions(dataset, source)
        pools[tuple(dimensions[name] for name in names)].append(
            InventoryFact(dimensions, turnover_source_amounts(source), source)
        )
    grouped = {key: sum_amounts(items) for key, items in pools.items()}
    previous_pools: dict[tuple[str, ...], list[InventoryFact]] = defaultdict(list)
    for items in pools.values():
        for item in items:
            key = tuple(
                item.dimensions[name]
                for name in ("month", "warehouse", "site", "listing", "sku", "msku")
            )
            previous_pools[key].append(item)
    previous_values = {key: sum_amounts(items) for key, items in previous_pools.items()}
    used: set[tuple[str, ...]] = set()
    output = []
    for key in sorted(grouped):
        amounts = grouped[key]
        item = pools[key][0]
        match_key = tuple(
            item.dimensions[name]
            for name in ("month", "warehouse", "site", "listing", "sku", "msku")
        )
        previous = previous_values.get((shift_month(match_key[0], -1), *match_key[1:]))
        for suffix in ("qty", "purchase", "amount"):
            if item.dimensions["warehouse"] == "FBA仓":
                transit = (
                    previous.get(f"transit_{suffix}")
                    if previous and match_key not in used
                    else Decimal(0)
                )
                beginning = combine([amounts[f"base_begin_{suffix}"], transit])
            else:
                beginning = (
                    previous.get(f"end_{suffix}")
                    if previous and match_key not in used
                    else Decimal(0)
                )
            amounts[f"begin_{suffix}"] = beginning
            total = combine([beginning, amounts.get(f"end_{suffix}")])
            amounts[f"average_{suffix}"] = total / 2 if total is not None else None
        used.add(match_key)
        output.append(InventoryFact(item.dimensions, amounts, item.source))
    return output
