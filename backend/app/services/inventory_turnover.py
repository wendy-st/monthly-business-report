"""原报告当期覆盖：经营期末、上月基础库存期初、进销存有符号流量。"""

from collections import defaultdict
from decimal import Decimal

from app.schemas.reports import ReportFilter
from app.services.financial_model import combine
from app.services.inventory_sources import (
    InventoryFact,
    current_stock,
    sum_amounts,
    turnover_facts,
)
from app.services.report_dataset import ReportDataset

SUFFIXES = {"qty": "quantity", "purchase": "purchase", "amount": "amount"}


def stock_key(item: InventoryFact) -> tuple[str, ...]:
    return tuple(item.dimensions[name] for name in ("warehouse", "site", "listing", "sku", "msku"))


def replace_current_stock(
    legacy: list[InventoryFact], stocks: list[InventoryFact]
) -> list[InventoryFact]:
    scopes = {item.dimensions["warehouse"] for item in stocks}
    previous: dict[tuple[str, ...], list[InventoryFact]] = defaultdict(list)
    current: dict[tuple[str, ...], list[InventoryFact]] = defaultdict(list)
    output = []
    for item in legacy:
        month = item.dimensions["month"]
        if month == "2026-08":
            previous[stock_key(item)].append(item)
        if month != "2026-09" or item.dimensions["warehouse"] not in scopes:
            output.append(item)
        else:
            # 被覆盖的存量整仓移除；流量独立保留，避免漏掉已售罄的SKU。
            amounts = {
                f"{prefix}_{suffix}": (
                    item.amounts.get(f"flow_{suffix}") if prefix == "flow" else Decimal(0)
                )
                for prefix in ("begin", "end", "average", "flow")
                for suffix in SUFFIXES
            }
            output.append(InventoryFact(item.dimensions.copy(), amounts, item.source))
    for item in stocks:
        current[stock_key(item)].append(item)
    for key, items in current.items():
        beginning = sum_amounts(previous[key])
        for index, item in enumerate(items):
            amounts = {}
            for suffix, field in SUFFIXES.items():
                # 同一库存键的期初只计一次，不因多条经营记录重复放大。
                start = beginning.get(f"end_{suffix}", Decimal(0)) if index == 0 else Decimal(0)
                ending = item.amounts.get(field)
                total = combine([start, ending])
                amounts.update(
                    {
                        f"begin_{suffix}": start,
                        f"end_{suffix}": ending,
                        f"average_{suffix}": total / 2 if total is not None else None,
                        f"flow_{suffix}": Decimal(0),
                    }
                )
            output.append(InventoryFact(item.dimensions.copy(), amounts, item.source))
    return output


def build_turnover(dataset: ReportDataset) -> list[InventoryFact]:
    return replace_current_stock(turnover_facts(dataset), current_stock(dataset, ReportFilter()))
