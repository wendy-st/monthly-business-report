"""只读接入发货标准；独立来源身份不覆盖已登记的经营快照。"""

import hashlib
from collections import defaultdict
from decimal import ROUND_CEILING, Decimal
from functools import lru_cache
from pathlib import Path

from app.services.financial_model import group_name, number
from app.services.inventory_styles import normalized_sku
from app.services.report_period import BASELINE_MONTH
from app.services.workbook_reader import RawRow, read_rows

SHIPPING_SOURCE = Path(__file__).resolve().parents[3] / "data/sources/2026-09/库存发货天数表.xlsx"
StandardKey = tuple[str, str, str, str]


def shipping_source(directory: Path | None = None, month: str = BASELINE_MONTH) -> Path:
    source = directory / "shipping.xlsx" if directory else SHIPPING_SOURCE
    return SHIPPING_SOURCE if month == BASELINE_MONTH and not source.exists() else source


def shipping_identity(source: Path = SHIPPING_SOURCE) -> str:
    return hashlib.sha256(source.read_bytes()).hexdigest() if source.exists() else "missing"


@lru_cache(maxsize=2)
def shipping_index(
    identity: str, source: Path = SHIPPING_SOURCE
) -> dict[StandardKey, list[RawRow]]:
    if identity == "missing":
        return {}
    index: dict[StandardKey, list[RawRow]] = defaultdict(list)
    for _, row in read_rows(source, "Sheet1", 1):
        group, site = group_name(row.get("小组")), (row.get("站点") or "").strip().upper()
        if group == "KAYO":
            group = "KAYO-北美" if site in {"US", "CA", "MX"} else "KAYO-欧日"
        if (
            group == "Ash"
            and site in {"US", "MX"}
            and row.get("LISTING") in {"SK001", "SK002", "SWS001", "SWS002"}
        ):
            group = "薄底水鞋"
        for dimension, field in (("sku", "积加SKU"), ("style", "产品款式"), ("listing", "LISTING")):
            raw = row.get(field) or ""
            key = normalized_sku(raw) if dimension == "sku" else raw.strip()
            index[group, site, row.get("LISTING") or "", f"{dimension}:{key}"].append(row)
    return dict(index)


def find_standard(
    index: dict[StandardKey, list[RawRow]], dimensions: dict[str, str]
) -> tuple[RawRow, str]:
    group, site, listing = (dimensions[field] for field in ("group", "site", "listing"))
    for dimension in ("sku", "style", "listing"):
        key = dimensions.get(dimension, "")
        if dimension == "sku":
            key = normalized_sku(key)
        rows = index.get((group, site, listing, f"{dimension}:{key}"), [])
        if not rows:
            continue
        standards = {(r.get("总发货天数"), r.get("运营保底下单天数")) for r in rows}
        if len(standards) != 1:
            return {}, "发货标准冲突"
        return rows[0], {"sku": "SKU", "style": "款式", "listing": "LISTING"}[dimension]
    return {}, "缺少发货标准"


def average_standard(
    index: dict[StandardKey, list[RawRow]], dimensions: dict[str, str]
) -> tuple[RawRow, int]:
    """每字段仅取有标准的去重SKU，一票一权，平均后向上取整。"""
    group, site, listing = (dimensions.get(field, "") for field in ("group", "site", "listing"))
    rows = index.get((group, site, listing, f"listing:{listing}"), [])
    style = dimensions.get("style", "")
    pools: dict[str, list[RawRow]] = defaultdict(list)
    for row in rows:
        if not style or row.get("产品款式") == style:
            pools[normalized_sku(row.get("积加SKU") or "")].append(row)
    standard: RawRow = {}
    for field in ("总发货天数", "运营保底下单天数"):
        amounts = [
            {row[field] for row in pool if (row.get(field) or "").strip()}
            for pool in pools.values()
        ]
        amounts = [items for items in amounts if items]
        if not amounts or any(len(values) != 1 for values in amounts):
            standard[field] = None
            continue
        values = [number(next(iter(items))) for items in amounts]
        # 空白不参与该字段分母；零照实参与，非空冲突仍不可计算。
        standard[field] = (
            str(
                (
                    sum((v for v in values if v is not None), Decimal(0)) / len(values)
                ).to_integral_value(rounding=ROUND_CEILING)
            )
            if all(value is not None and value >= 0 for value in values)
            else None
        )
    return standard, len(pools)
