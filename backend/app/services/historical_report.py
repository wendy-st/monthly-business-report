"""冻结历史利润独立展示，不用经营重算利润覆盖历史源利润。"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.reports import MetricRow, ReportFilter
from app.services.financial_model import (
    Amounts,
    aggregate,
    combine,
    financials,
    number,
    ratio,
    serialize,
)
from app.services.report_dataset import ReportDataset
from app.services.source_import import SourceRecord

HISTORICAL_NAMES = {
    "赔偿成本&弃置成本": "赔偿成本",
    "基本月度仓储费": "基础仓储费",
    "海外仓费用": "海外仓",
    "FBA佣金": "佣金",
    "FBA赔偿": "赔偿",
    "礼品补贴": "礼品卡补贴",
}


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


def historical_best(
    dataset: ReportDataset, records: list[SourceRecord]
) -> tuple[list[MetricRow], list[MetricRow]]:
    positions: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for source in dataset.records("products"):
        positions[source.group, source.site, source.listing].add(source.raw.get("产品定位") or "")
    pools: dict[tuple[str, str, str], list[SourceRecord]] = defaultdict(list)
    for source in records:
        pools[historical_group(source), source.site, source.listing].append(source)
    best, excluded = [], []
    for key, listing_records in pools.items():
        monthly = history_rows(listing_records, "monthly")
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
        current = next((row for row in monthly if row.dimensions["month"] == "2026-09"), None)
        current_profit = number(current.current["profit"]) if current else Decimal(0)
        peak_profit = number(peak.current["profit"])
        peak.current["gap"] = (
            str(peak_profit - current_profit)
            if peak_profit is not None and current_profit is not None
            else None
        )
        peak.current["current_profit"] = str(current_profit) if current_profit is not None else None
        position = "、".join(sorted(positions[key]))
        peak.dimensions.update(dict(zip(("group", "site", "listing"), key, strict=True)))
        peak.dimensions["position"] = position
        peak.key, peak.label = "|".join(key), " / ".join(key)
        yearly_sales = combine(
            historical_amounts(source)["sales_amount"]
            for source in listing_records
            if source.period.startswith("2026")
        )
        reason = (
            "定位含停运或废弃"
            if any(label in position for label in ("停运", "废弃"))
            else "本年累计销售金额非正或缺失"
            if yearly_sales is None or yearly_sales <= 0
            else ""
        )
        if reason:
            peak.dimensions["excluded_reason"] = reason
            excluded.append(peak)
        else:
            best.append(peak)
    return sorted(best, key=lambda row: number(row.current["gap"]) or 0, reverse=True), excluded


def historical_group(source: SourceRecord) -> str:
    if source.group == "KAYO":
        if source.site in {"US", "MX", "CA"}:
            return "KAYO-北美"
        if source.site in {"UK", "DE", "FR", "IT", "ES", "JP"}:
            return "KAYO-欧日"
    if (
        source.group == "JASON"
        and source.site in {"US", "MX"}
        and source.listing in {"SK001", "SK002", "SWS001", "SWS002"}
    ):
        return "薄底水鞋"
    return source.group or "未分配"


def historical_amounts(source: SourceRecord) -> Amounts:
    raw = source.raw.copy()
    for target, origin in HISTORICAL_NAMES.items():
        raw[target] = raw.get(origin)
    result = financials(raw)
    result["gross_profit"] = number(raw.get("主营业务利润"))
    result["operating_profit"] = number(raw.get("产品营业利润"))
    result["profit"] = number(raw.get("产品净利润"))
    result["margin"] = ratio(result["profit"], result["revenue"])
    result["gross_margin"] = ratio(result["gross_profit"], result["revenue"])
    return result


def frozen_summary(records: list[SourceRecord], key: str, values: dict[str, str]) -> MetricRow:
    rows = [historical_amounts(source) for source in records]
    amounts = aggregate(rows)
    for metric in ("gross_profit", "operating_profit", "profit"):
        amounts[metric] = combine(item[metric] for item in rows)
    amounts["margin"] = ratio(amounts["profit"], amounts["revenue"])
    amounts["gross_margin"] = ratio(amounts["gross_profit"], amounts["revenue"])
    return MetricRow(
        key=key,
        label=" / ".join(values.values()),
        dimensions=values,
        current=serialize(amounts),
        previous={},
        year_ago={},
        record_count=len(records),
        status="OK",
        source_rows=[item.row for item in records],
    )


def history_rows(records: list[SourceRecord], grain: str) -> list[MetricRow]:
    pools: dict[tuple[str, ...], list[SourceRecord]] = defaultdict(list)
    for source in records:
        key: tuple[str, ...]
        names: tuple[str, ...]
        if grain == "annual":
            key = (source.period[:4],)
            names = ("year",)
        elif grain == "quarterly":
            key = (f"{source.period[:4]}-Q{(int(source.period[5:]) - 1) // 3 + 1}",)
            names = ("quarter",)
        elif grain == "monthly":
            key = (source.period,)
            names = ("month",)
        else:
            key = (historical_group(source), source.site, source.listing)
            names = ("group", "site", "listing")
        pools[key].append(source)
    return (
        [
            frozen_summary(items, "|".join(key), dict(zip(names, key, strict=True)))
            for key, items in sorted(pools.items())
        ]
        if pools
        else []
    )


def history_view(dataset: ReportDataset, filters: ReportFilter, years: list[str]) -> HistoryView:
    scoped = [
        source
        for source in dataset.records("history")
        if source.period
        and source.listing
        and source.period <= "2026-09"
        and (not filters.group or historical_group(source) == filters.group)
    ]
    records = [
        source
        for source in scoped
        if source.period
        and source.listing
        and source.period <= "2026-09"
        and (not filters.group or historical_group(source) == filters.group)
        and (not filters.site or source.site == filters.site)
        and (not filters.listing or source.listing == filters.listing)
    ]
    selected = [source for source in records if source.period[:4] in years]
    best, excluded = historical_best(dataset, records)
    return HistoryView(
        annual=history_rows(records, "annual"),
        quarterly=history_rows(selected, "quarterly")[-12:],
        monthly=history_rows(selected, "monthly")[-24:],
        listings=history_rows(selected, "listings"),
        best_months=best,
        years=sorted({source.period[:4] for source in records}),
        source_note="历史LISTING结果表：利润保留源字段；年度为完整年度汇总，季/月按所选年份。",
        excluded=excluded,
        options={
            "site": sorted({source.site for source in scoped}),
            "listing": sorted(
                {
                    source.listing
                    for source in scoped
                    if not filters.site or source.site == filters.site
                }
            ),
        },
    )
