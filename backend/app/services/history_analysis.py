"""年度累计同比、业务拆解和盈利象限，均按冻结历史金额计算。"""

from decimal import Decimal

from app.schemas.reports import MetricRow
from app.services.financial_model import combine, number, ratio
from app.services.history_data import frozen_summary, history_rows
from app.services.history_periods import HistoryCalendar
from app.services.source_import import SourceRecord


def change(current: str | None, prior: str | None, *, points: bool = False) -> str | None:
    left, right = number(current), number(prior)
    if left is None or right is None:
        return None
    result = left - right if points else ratio(left - right, abs(right))
    return str(result) if result is not None else None


def comparison(current: MetricRow, prior: MetricRow) -> MetricRow:
    current.year_ago = prior.current
    current.changes = {
        f"{key}_yoy": change(
            current.current.get(key), prior.current.get(key), points=key == "margin"
        )
        for key in ("units", "revenue", "profit", "margin")
    }
    return current


def annual_comparison(records: list[SourceRecord], calendar: HistoryCalendar) -> list[MetricRow]:
    return [
        cumulative_summary(records, year, calendar)
        for year in sorted({calendar.year(row.period) for row in records})
    ]


def listing_breakdown(records: list[SourceRecord]) -> list[MetricRow]:
    rows = history_rows(records, "listings")
    revenue = combine(number(row.current.get("revenue")) for row in rows)
    profit = combine(number(row.current.get("profit")) for row in rows)
    for row in rows:
        for key, total in (("revenue", revenue), ("profit", profit)):
            share = ratio(number(row.current.get(key)), total)
            row.current[f"{key}_share"] = str(share) if share is not None else None
    return sorted(
        rows, key=lambda row: number(row.current.get("revenue")) or Decimal(0), reverse=True
    )


def quadrant(rows: list[MetricRow]) -> dict[str, str | None]:
    points = [
        row
        for row in rows
        if (number(row.current.get("revenue")) or 0) > 0 and row.current.get("margin") is not None
    ][:25]
    sales = sorted(number(row.current["revenue"]) or Decimal(0) for row in points)
    revenue = combine(number(row.current["revenue"]) for row in points)
    profit = combine(number(row.current["profit"]) for row in points)
    margin = ratio(profit, revenue)
    return {
        "margin": str(margin) if margin is not None else None,
        "revenue": str(sales[len(sales) // 2]) if sales else None,
    }


def insights(rows: list[MetricRow]) -> dict[str, MetricRow | None]:
    profits = [row for row in rows if row.current.get("profit") is not None]
    rates = [
        row
        for row in rows
        if (number(row.current.get("revenue")) or 0) > 0 and row.current.get("margin") is not None
    ]
    return {
        "sales": rows[0] if rows else None,
        "profit": max(profits, key=lambda row: number(row.current["profit"]) or 0)
        if profits
        else None,
        "weak": min(rates, key=lambda row: number(row.current["margin"]) or 0) if rates else None,
    }


def cumulative_summary(
    records: list[SourceRecord], year: str, calendar: HistoryCalendar
) -> MetricRow:
    end = calendar.end_index(year)
    current = frozen_summary(calendar.select(records, year), year, {"year": year})
    prior_year = str(int(year) - 1)
    prior = frozen_summary(calendar.select(records, prior_year, end), "prior", {"year": prior_year})
    current.dimensions["period_label"] = calendar.label(year)
    current.dimensions["previous_period_label"] = calendar.previous_label(year)
    return comparison(current, prior)
