"""年度经营分析：历史金额只取近6年LISTING源表，产品表仅提供定位。"""

from collections import defaultdict
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.reports import HistoryFilter, MetricRow, PeriodScope, ReportFilter, YearBasis
from app.services.financial_model import combine, number
from app.services.history_analysis import (
    annual_comparison,
    cumulative_summary,
    insights,
    listing_breakdown,
    quadrant,
)
from app.services.history_data import SEPTEMBER_POSITION_OVERRIDES, historical_group, history_rows
from app.services.history_data import historical_amounts as historical_amounts
from app.services.history_periods import HistoryCalendar
from app.services.report_dataset import ReportDataset
from app.services.source_import import SourceRecord


class HistoryView(BaseModel):
    annual: list[MetricRow]
    quarterly: list[MetricRow]
    monthly: list[MetricRow]
    listings: list[MetricRow]
    best_months: list[MetricRow]
    years: list[str]
    source_note: str
    excluded: list[MetricRow]
    options: dict[str, list[str]]
    summary: MetricRow
    period_label: str
    previous_period_label: str
    anchor_year: str
    max_month: int
    period_start: str
    period_end: str
    source_file: str
    source_sheet: str
    cost_trends: list[MetricRow]
    quadrant: dict[str, str | None]
    insights: dict[str, MetricRow | None]
    year_basis: YearBasis
    period_scope: PeriodScope
    year_labels: dict[str, str]
    month_order: list[int]


def product_positions(dataset: ReportDataset) -> dict[tuple[str, str, str], str]:
    """定位冲突保留待确认；原稿手工覆盖优先于源款式定位。"""
    positions: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for row in dataset.records("products"):
        position = (row.raw.get("产品定位") or "").strip()
        if position:
            positions[historical_group(row), row.site, row.listing].add(position)
    labels = {
        key: next(iter(values)) if len(values) == 1 else "定位待确认：" + "、".join(sorted(values))
        for key, values in positions.items()
    }
    if dataset.manifest.get("report_month") == "2026-09":
        labels.update(SEPTEMBER_POSITION_OVERRIDES)
    return labels


def eligibility(
    dataset: ReportDataset, records: list[SourceRecord], year: str
) -> tuple[set[tuple[str, str]], dict[tuple[str, str], str], dict[tuple[str, str, str], str]]:
    """沿用原稿资格范围：先按站点＋LISTING跨小组判断，再筛选小组。"""
    labels = product_positions(dataset)
    fallback: dict[tuple[str, str], set[str]] = defaultdict(set)
    for key, position in labels.items():
        if not position.startswith("定位待确认："):
            fallback[key[1:]].add(position)
    sales: dict[tuple[str, str], list[Decimal | None]] = defaultdict(list)
    for row in records:
        if row.period.startswith(year):
            sales[row.site, row.listing].append(number(row.raw.get("销售金额")))
    reasons = {}
    stopped = set()
    for row in records:
        key = historical_group(row), row.site, row.listing
        values = fallback[row.site, row.listing]
        if (key not in labels or labels[key].startswith("定位待确认：")) and len(values) == 1:
            labels[key] = next(iter(values))
        position = labels.get(key, "")
        if not position.startswith("定位待确认：") and any(
            word in position for word in ("停运", "废弃")
        ):
            stopped.add((row.site, row.listing))
    for listing_key in {(row.site, row.listing) for row in records}:
        total = combine(sales[listing_key])
        if total is None or total <= 0:
            reasons[listing_key] = "本年累计销售金额非正或缺失"
        elif listing_key in stopped:
            reasons[listing_key] = "定位含停运或废弃"
    active = {(row.site, row.listing) for row in records} - reasons.keys()
    return active, reasons, labels


def historical_best(
    records: list[SourceRecord],
    reasons: dict[tuple[str, str], str],
    positions: dict[tuple[str, str, str], str],
    period: str,
) -> tuple[list[MetricRow], list[MetricRow]]:
    pools: dict[tuple[str, str, str], list[SourceRecord]] = defaultdict(list)
    for source in records:
        pools[historical_group(source), source.site, source.listing].append(source)
    best, excluded = [], []
    for key, sources in pools.items():
        monthly = history_rows(sources, "monthly")
        available = [row for row in monthly if row.current["profit"] is not None]
        if not available:
            continue
        peak = max(
            available,
            key=lambda row: (
                number(row.current["profit"]) or 0,
                number(row.current["revenue"]) or 0,
            ),
        )
        current = next((row for row in monthly if row.dimensions["month"] == period), None)
        for metric in ("profit", "revenue", "margin"):
            value = current.current.get(metric) if current else None
            peak.current[f"current_{metric}"] = value
            left, right = number(value), number(peak.current.get(metric))
            peak.current[f"{metric}_difference"] = (
                str(left - right) if left is not None and right is not None else None
            )
        difference = number(peak.current["profit_difference"])
        peak.current["gap"] = str(-difference) if difference is not None else None
        peak.dimensions.update(dict(zip(("group", "site", "listing"), key, strict=True)))
        peak.dimensions["position"] = positions.get(key, "")
        peak.key, peak.label = "|".join(key), " / ".join(key)
        reason = reasons.get(key[1:], "")
        if reason:
            peak.dimensions["excluded_reason"] = reason
            excluded.append(peak)
        else:
            best.append(peak)
    return sorted(best, key=lambda row: number(row.current["gap"]) or 0, reverse=True), excluded


def scope_records(records: list[SourceRecord], filters: ReportFilter) -> list[SourceRecord]:
    return [
        row
        for row in records
        if (not filters.site or row.site == filters.site)
        and (not filters.listing or row.listing == filters.listing)
    ]


def history_view(dataset: ReportDataset, filters: ReportFilter, years: list[str]) -> HistoryView:
    cutoff = str(dataset.manifest.get("report_month", "2026-09"))
    all_records = [
        row
        for row in dataset.records("history")
        if row.period and row.listing and row.period <= cutoff
    ]
    active, reasons, positions = eligibility(dataset, all_records, cutoff[:4])
    scoped = [
        row for row in all_records if not filters.group or historical_group(row) == filters.group
    ]
    eligible = [row for row in scoped if (row.site, row.listing) in active]
    records = scope_records(eligible, filters)
    period_start = min((row.period for row in all_records), default=cutoff)
    calendar = HistoryCalendar(
        filters.year_basis if isinstance(filters, HistoryFilter) else "calendar",
        filters.period_scope if isinstance(filters, HistoryFilter) else "full",
        cutoff,
        period_start,
    )
    selected_years = years or [calendar.year(cutoff)]
    anchor = max(selected_years)
    selected = calendar.selected(records, selected_years)
    # 业务拆解、象限和洞察不随单个趋势LISTING缩窄，保留站点内横向对比。
    site_records = scope_records(eligible, filters.model_copy(update={"listing": ""}))
    breakdown = listing_breakdown(calendar.select(site_records, anchor))
    best, excluded = historical_best(scope_records(scoped, filters), reasons, positions, cutoff)
    period_end = max((row.period for row in all_records), default="")
    source = all_records[0] if all_records else None
    available_years = sorted({calendar.year(row.period) for row in all_records})
    return HistoryView(
        annual=annual_comparison(records, calendar),
        quarterly=calendar.quarterly(selected)[-12:],
        monthly=calendar.monthly(selected)[-24:],
        listings=breakdown,
        best_months=best,
        years=available_years,
        source_note="金额均取近6年LISTING数据表；净销售额=销售金额+退货金额，净利润保留产品净利润源字段。所有区域按站点＋LISTING跨组排除本年无销售及停运/废弃组合；定位引用产品基础信息，并沿用原9月报告已确认的手工覆盖，其他冲突保留待确认。",
        excluded=excluded,
        options={
            "site": sorted({row.site for row in eligible}),
            "listing": sorted(
                {row.listing for row in eligible if not filters.site or row.site == filters.site}
            ),
        },
        summary=cumulative_summary(records, anchor, calendar),
        period_label=calendar.label(anchor),
        previous_period_label=calendar.previous_label(anchor),
        anchor_year=anchor,
        max_month=int(calendar.period(anchor, max(1, calendar.end_index(anchor)))[5:]),
        period_start=period_start,
        period_end=period_end,
        source_file=source.file if source else "",
        source_sheet=source.sheet if source else "",
        cost_trends=calendar.monthly(selected),
        quadrant=quadrant(breakdown),
        insights=insights(breakdown),
        year_basis=calendar.basis,
        period_scope=calendar.scope,
        year_labels={year: calendar.year_label(year) for year in available_years},
        month_order=calendar.month_order,
    )
