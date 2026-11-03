"""只用已匹配或人工确认的库存款式映射；预测保留原报告的SKU推断后备。"""

import re
from collections import defaultdict
from functools import lru_cache

from app.services.report_dataset import ReportDataset


def normalized_sku(value: str) -> str:
    return " ".join(value.split()).upper()


@lru_cache(maxsize=1)
def inventory_styles(dataset: ReportDataset) -> dict[tuple[str, str, str], str]:
    pools: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for source in dataset.records("style_mapping"):
        if not source.file.endswith(f"{dataset.month}.xlsx"):
            continue
        raw = source.raw
        style = (
            raw.get("已匹配款式")
            if source.sheet == "自动匹配核对"
            else (raw.get("补充产品款式") if raw.get("确认状态") == "已确认" else "")
        )
        if raw.get("确认状态") == "不适用":
            style = "不适用"
        if style:
            # 待补充表允许同一确认行列出多个MSKU；逐个定位，不能把整段当作一个键。
            keys = (
                [normalized_sku(source.sku)]
                if source.sku
                else [
                    "@" + value.strip() for value in re.split("[；;]", source.msku) if value.strip()
                ]
            )
            for sku_key in keys:
                pools[source.site, source.listing, sku_key].add(style.strip())
    # 未入映射表的库存行，只接受产品资料中存在的同名款式。
    catalogue = {
        (source.site, source.listing, source.style)
        for source in dataset.records("products")
        if source.style
    }
    for source in dataset.records("current_inventory"):
        key = (source.site, source.listing, normalized_sku(source.sku))
        name = source.raw.get("产品名称") or ""
        if key not in pools and (source.site, source.listing, name) in catalogue:
            pools[key].add(name)
    conflicts = [key for key, values in pools.items() if len(values) > 1]
    if conflicts:
        raise ValueError(f"库存款式映射存在{len(conflicts)}个冲突键，停止核算")
    return {key: next(iter(values)) for key, values in pools.items()}


def style_name(dataset: ReportDataset, site: str, listing: str, sku: str, msku: str = "") -> str:
    mapping = inventory_styles(dataset)
    return mapping.get((site, listing, normalized_sku(sku)), "") or mapping.get(
        (site, listing, "@" + msku), ""
    )


def forecast_style(dataset: ReportDataset, site: str, listing: str, sku: str) -> str:
    mapped = style_name(dataset, site, listing, sku)
    if mapped:
        return mapped
    parts = sku.split()
    if parts and (
        re.fullmatch(r"\d+(?:\.\d+)?", parts[-1])
        or parts[-1].upper() in {"XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"}
    ):
        parts = parts[:-1]
    return " ".join(parts) or "未映射款式"
