"""产品资料是销售季唯一来源；季节月份按跨年连续区间处理。"""

import re
from functools import lru_cache

from app.schemas.reports import ReportFilter
from app.services.inventory_forecast import forecast_amounts
from app.services.inventory_sources import shift_month
from app.services.report_dataset import ReportDataset


@lru_cache(maxsize=1)
def season_catalogue(dataset: ReportDataset) -> dict[tuple[str, str, str], set[tuple[int, ...]]]:
    output: dict[tuple[str, str, str], set[tuple[int, ...]]] = {}
    for item in dataset.records("products"):
        months = tuple(sorted({int(m) for m in re.findall(r"\d+", item.raw.get("旺季月份") or "")}))
        output.setdefault((item.group, item.site, item.listing), set()).add(months)
    return output


def season_bounds(months: tuple[int, ...], current: str) -> tuple[str, str, str]:
    """季初、季末优先；销售季前三个自然月备货，不受预测峰值移动影响。"""
    selected = set(months)
    starts = [m for m in months if (m - 2) % 12 + 1 not in selected]
    if not selected or len(starts) != 1 or any(m < 1 or m > 12 for m in selected):
        return "季节资料待确认", "", ""
    start_month = starts[0]
    length = len(months)
    if any((start_month + n - 1) % 12 + 1 not in selected for n in range(length)):
        return "季节资料待确认", "", ""
    start = f"{current[:4]}-{start_month:02}"
    if current < shift_month(start, -3):
        start = shift_month(start, -12)
    end = shift_month(start, length - 1)
    phase = (
        "备货期"
        if current < start
        else "季初"
        if current == start
        else "季末"
        if current == end
        else "旺季"
        if current < end
        else "淡季"
    )
    return phase, start, end


def season_context(dataset: ReportDataset, filters: ReportFilter) -> tuple[str, str, str, str]:
    catalogue = season_catalogue(dataset)
    candidates = [
        values
        for (group, site, listing), values in catalogue.items()
        if (not filters.group or group == filters.group)
        and (not filters.site or site == filters.site)
        and (not filters.listing or listing == filters.listing)
    ]
    if not candidates:
        return "缺少季节资料", "", "", ""
    if any(len(values) != 1 or not next(iter(values)) for values in candidates):
        return "季节资料待确认", "", "", ""
    seasons = set().union(*candidates)
    if len(seasons) != 1:
        return "多销售季", "", "", ""
    months = next(iter(seasons))
    if len(months) == 12:
        return "全年销售", "", "", ""
    current = str(dataset.manifest["report_month"])
    phase, start, end = season_bounds(months, current)
    forecasts, _ = forecast_amounts(dataset, filters, future_only=False)
    season = {month: value for month, value in forecasts.items() if start <= month <= end}
    # 整个销售季必须都有预测才确认峰值，不能拿缺失的跨年月份当零。
    expected = [shift_month(start, index) for index in range(len(months))] if start else []
    peak = ""
    if expected and all(season.get(month) is not None for month in expected):
        positive = {
            month: value for month, value in season.items() if value is not None and value > 0
        }
        peak = max(positive, key=lambda month: positive[month]) if positive else ""
    return phase, start, end, peak
