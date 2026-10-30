"""库存两套来源严格分离：经营库存管存量，周转表仅管周转。"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal

from app.schemas.reports import ReportFilter
from app.services.financial_model import Amounts, combine, number
from app.services.report_dataset import ReportDataset
from app.services.source_import import SourceRecord

WAREHOUSES = {"FBA仓", "海外仓", "本地仓"}


@dataclass
class InventoryFact:
    dimensions: dict[str, str]
    amounts: Amounts
    source: SourceRecord


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
    }


def matches(values: dict[str, str], filters: ReportFilter) -> bool:
    return all(
        not getattr(filters, key) or getattr(filters, key) == values[key]
        for key in ("group", "site", "listing", "category1", "category2", "category3")
    )


def current_stock(dataset: ReportDataset, filters: ReportFilter) -> list[InventoryFact]:
    result = []
    for source in dataset.records("current_inventory"):
        values = inventory_dimensions(dataset, source)
        if source.period != "2026-09" or not matches(values, filters):
            continue
        if values["warehouse"] not in WAREHOUSES:
            continue
        raw = source.raw
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
        if values["warehouse"] != "FBA仓" or raw.get("同步状态") == "异常":
            for key in ("in_stock", "age180", "age270"):
                amounts[key] = Decimal(0)
        result.append(InventoryFact(values, amounts, source))
    return result


def shift_month(month: str, offset: int) -> str:
    year, monthly = map(int, month.split("-"))
    index = year * 12 + monthly - 1 + offset
    return f"{index // 12:04}-{index % 12 + 1:02}"


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
    pools: dict[tuple[str, ...], list[InventoryFact]] = defaultdict(list)
    for source in dataset.records("inventory"):
        values = inventory_dimensions(dataset, source)
        source_key: tuple[str, ...] = (
            source.period,
            values["warehouse"],
            source.site,
            source.listing,
            source.sku,
            source.msku,
        )
        pools[source_key].append(InventoryFact(values, turnover_source_amounts(source), source))
    grouped = {key: sum_amounts(facts) for key, facts in pools.items()}
    output = []
    for key, amounts in grouped.items():
        representative = pools[key][0]
        previous_key = (shift_month(key[0], -1), *key[1:])
        previous = grouped.get(previous_key)
        for suffix in ("qty", "purchase", "amount"):
            if representative.dimensions["warehouse"] == "FBA仓":
                # 上月没有该SKU记录代表该SKU上月在途为零；字段缺失仍保留缺失。
                transit = previous.get(f"transit_{suffix}") if previous else Decimal(0)
                beginning = combine([amounts[f"base_begin_{suffix}"], transit])
            else:
                beginning = previous.get(f"end_{suffix}") if previous else Decimal(0)
            amounts[f"begin_{suffix}"] = beginning
            ending = amounts.get(f"end_{suffix}")
            total = combine([beginning, ending])
            amounts[f"average_{suffix}"] = total / 2 if total is not None else None
        groups = {item.dimensions["group"] for item in pools[key]}
        if len(groups) > 1:
            representative.dimensions["group"] = "未分配"
        output.append(InventoryFact(representative.dimensions, amounts, representative.source))
    return output
