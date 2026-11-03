"""逐SKU核算发货及保底满足率；合计层展示范围，不平均不同尺码的满足率。"""

from collections import defaultdict
from decimal import Decimal
from functools import lru_cache

from app.schemas.inventory import InventoryRow
from app.schemas.reports import ReportFilter
from app.services.financial_model import combine, number, ratio, serialize
from app.services.inventory_diagnosis import (
    AGED,
    LOCAL_SHORT,
    REDUNDANT,
    TOTAL_SHORT,
    inventory_diagnosis,
)
from app.services.inventory_forecast import covered_days, forecast_records
from app.services.inventory_sources import InventoryFact, current_stock
from app.services.inventory_styles import normalized_sku
from app.services.report_dataset import ReportDataset
from app.services.shipping_standards import find_standard, shipping_index, shipping_source
from app.services.workbook_reader import RawRow

SkuKey = tuple[str, str, str, str]


def sku_key(dimensions: dict[str, str]) -> SkuKey:
    return (
        dimensions["group"],
        dimensions["site"],
        dimensions["listing"],
        normalized_sku(dimensions.get("sku", "")),
    )


def assess_sku(
    dimensions: dict[str, str],
    facts: list[InventoryFact],
    forecast: dict[str, Decimal | None],
    standard: RawRow,
    matched: str,
) -> InventoryRow:
    positive = [month for month, value in forecast.items() if value is not None and value > 0]
    if positive:
        forecast = {month: value for month, value in forecast.items() if month <= max(positive)}
    local = [item for item in facts if item.dimensions["warehouse"] == "本地仓"]
    abroad = [item for item in facts if item.dimensions["warehouse"] != "本地仓"]
    fba = [item for item in facts if item.dimensions["warehouse"] == "FBA仓"]
    # 有库存行但可用量缺失时保留缺失，不能借用总库存充当可发货现货。
    available = (
        combine(number(item.source.raw.get("可用量")) for item in local) if local else Decimal(0)
    )
    total = combine(item.amounts.get("quantity") for item in facts) if facts else Decimal(0)
    overseas = combine(item.amounts.get("quantity") for item in abroad) if abroad else Decimal(0)
    shipping, minimum = number(standard.get("总发货天数")), number(standard.get("运营保底下单天数"))
    local_days, local_bound = covered_days(available, forecast)
    total_days, total_bound = covered_days(total, forecast)
    abroad_days, abroad_bound = covered_days(overseas, forecast)
    demand = combine(forecast.values()) if forecast else None
    notes = []
    if not standard:
        notes.append(matched)
    if not forecast:
        notes.append("缺少销量预测")
    elif demand == 0:
        notes.append("未来预测需求为零")
    if available is None:
        notes.append("缺少本地仓可用量")
    rates: dict[str, Decimal | None] = {}
    for name, days, limit, bounded in (
        ("shipping", local_days, shipping, local_bound),
        ("order", total_days, minimum, total_bound),
    ):
        if standard and (limit is None or limit <= 0):
            notes.append(
                f"{'发货' if name == 'shipping' else '保底下单'}标准"
                f"{'缺失' if limit is None else '为零或负数'}"
            )
        rates[f"{name}_rate"] = ratio(days, limit) if limit is not None and limit > 0 else None
        if bounded and days is not None and limit is not None and days < limit:
            rates[f"{name}_rate"] = None
            notes.append("预测窗口不足以判断达标")
    if local_days is None or total_days is None:
        if forecast and demand != 0:
            notes.append("预测数据不完整，无法计算覆盖天数")
    aged = combine(item.amounts.get("age270") for item in fba) if fba else Decimal(0)
    in_stock = combine(item.amounts.get("in_stock") for item in fba) if fba else Decimal(0)
    age_rate = ratio(aged, in_stock)
    result = InventoryRow(
        key="|".join(sku_key(dimensions)),
        label=dimensions.get("sku", ""),
        dimensions={
            **dimensions,
            "standard_match": matched,
            "notes": "；".join(dict.fromkeys(notes)),
        },
        values={
            **serialize(
                {
                    "local_available": available,
                    "total_quantity": total,
                    "abroad_quantity": overseas,
                    "shipping_days": shipping,
                    "order_days": minimum,
                    "local_days": local_days,
                    "total_days": total_days,
                    "abroad_days": abroad_days,
                    "coverage": ratio(overseas, demand),
                    "age270": aged,
                    "in_stock": in_stock,
                    "age270_rate": age_rate,
                    **rates,
                }
            ),
            "local_bound": str(int(local_bound)),
            "total_bound": str(int(total_bound)),
            "abroad_bound": str(int(abroad_bound)),
            "has_inventory": str(int(any(item.amounts.get("quantity") != 0 for item in facts))),
        },
        source_rows=[item.source.row for item in facts],
    )
    flags, description = inventory_diagnosis(result.values)
    result.dimensions.update(issues="；".join(flags), diagnosis=description)
    return result


@lru_cache(maxsize=2)
def all_readiness(dataset: ReportDataset, identity: str) -> list[InventoryRow]:
    stocks: dict[SkuKey, list[InventoryFact]] = defaultdict(list)
    dimensions = {}
    for item in current_stock(dataset, ReportFilter()):
        key = sku_key(item.dimensions)
        stocks[key].append(item)
        dimensions[key] = item.dimensions
    forecasts: dict[SkuKey, dict[str, Decimal | None]] = defaultdict(dict)
    current = str(dataset.manifest["report_month"])
    for dims, amounts in forecast_records(dataset)[0]:
        key = sku_key(dims)
        dimensions.setdefault(key, dims)
        for month, value in amounts.items():
            if month <= current:
                continue
            prior = forecasts[key].get(month, Decimal(0))
            forecasts[key][month] = (
                prior + value if prior is not None and value is not None else None
            )
    standards = shipping_index(
        identity, shipping_source(getattr(dataset, "directory", None), dataset.month)
    )
    output = []
    for key in sorted(stocks.keys() | forecasts.keys()):
        dims, items, forecast = dimensions[key], stocks[key], forecasts[key]
        if not any(item.amounts.get("quantity") for item in items) and not any(forecast.values()):
            continue
        standard, matched = find_standard(standards, dims)
        output.append(assess_sku(dims, items, forecast, standard, matched))
    return output


def readiness_summary(rows: list[InventoryRow]) -> tuple[dict[str, str | None], list[str]]:
    values: dict[str, str | None] = {"sku_count": str(len(rows))}
    for field in ("shipping_rate", "order_rate", "shipping_days", "order_days"):
        amounts = [number(row.values.get(field)) for row in rows]
        valid = [value for value in amounts if value is not None]
        values[f"{field}_min"] = str(min(valid)) if valid else None
        values[f"{field}_max"] = str(max(valid)) if valid else None
        values[f"{field}_missing"] = str(len(amounts) - len(valid))
    for flag, key in (
        (LOCAL_SHORT, "shipping_short"),
        (TOTAL_SHORT, "order_short"),
        (REDUNDANT, "redundant_skus"),
        (AGED, "aged_skus"),
    ):
        values[key] = str(sum(flag in row.dimensions["issues"].split("；") for row in rows))
    values["incomplete_skus"] = str(sum(bool(row.dimensions["notes"]) for row in rows))
    issues = [
        f"{label}：{values[key]}个SKU"
        for key, label in (
            ("shipping_short", LOCAL_SHORT),
            ("order_short", TOTAL_SHORT),
            ("redundant_skus", REDUNDANT),
            ("aged_skus", "存在270天以上库存"),
            ("incomplete_skus", "资料待补充"),
        )
        if int(values[key] or 0)
    ]
    return values, issues
