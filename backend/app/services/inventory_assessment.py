"""在售范围及LISTING/款式汇总核算；标准按源表SKU等权平均。"""

from functools import lru_cache

from app.schemas.inventory import InventoryRow
from app.schemas.reports import ReportFilter
from app.services.inventory_forecast import forecast_amounts
from app.services.inventory_readiness import assess_sku
from app.services.inventory_sources import InventoryFact
from app.services.report_dataset import ReportDataset
from app.services.shipping_standards import average_standard, shipping_identity, shipping_index


@lru_cache(maxsize=1)
def active_listings(dataset: ReportDataset) -> set[tuple[str, str, str]]:
    return {
        (item.group, item.site, item.listing)
        for item in dataset.records("products")
        if item.raw.get("产品定位") in {"维护", "新品"}
    }


def listing_key(dimensions: dict[str, str]) -> tuple[str, str, str]:
    return dimensions["group"], dimensions["site"], dimensions["listing"]


def scope_assessment(
    dataset: ReportDataset, stocks: list[InventoryFact], filters: ReportFilter
) -> InventoryRow:
    dimensions = {name: getattr(filters, name) for name in ("group", "site", "listing", "style")}
    standard, count = average_standard(shipping_index(shipping_identity()), dimensions)
    forecast, _ = forecast_amounts(dataset, filters, allowed_listings=active_listings(dataset))
    result = assess_sku(dimensions, stocks, forecast, standard, "SKU等权平均向上取整")
    result.values["standard_sku_count"] = str(count)
    return result
