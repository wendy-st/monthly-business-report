"""总览派生结果只使用后端已核算的三期金额。"""

from collections import defaultdict
from decimal import Decimal

from app.schemas.overview import OverviewDetails, OverviewRow
from app.schemas.reports import FinancialView, MetricRow
from app.services.cost_analysis import BasisAnalysis
from app.services.financial_model import aggregate, number, ratio, serialize
from app.services.financial_report import changes
from app.services.overview_conclusion import overview_conclusions


def conversion_changes(items: list[BasisAnalysis]) -> dict[str, dict[str, dict[str, str | None]]]:
    result: dict[str, dict[str, dict[str, str | None]]] = {}
    for item in items:
        changes: dict[str, str | None] = {}
        for key in ("revenue", "profit"):
            current, base = number(item.current.get(key)), number(item.base.get(key))
            growth = (
                ratio(current - base, base) if current is not None and base and base > 0 else None
            )
            changes[key] = f"{growth * 100:+.1f}%" if growth is not None else None
        result.setdefault(item.comparison, {})[item.basis] = changes
    return result


PERIOD_FIELDS = ("current", "previous", "year_ago")
DISPLAY_FIELDS = {"units", "revenue", "profit", "margin"}


def merge_rows(
    rows: list[MetricRow], key: str, label: str, dimensions: dict[str, str]
) -> MetricRow:
    amounts = [
        aggregate(
            {name: number(value) for name, value in values.items()}
            for row in rows
            for values in [getattr(row, period)]
            if any(value is not None for value in values.values())
        )
        for period in PERIOD_FIELDS
    ]
    count = sum(row.record_count for row in rows)
    return MetricRow(
        key=key,
        label=label,
        dimensions=dimensions,
        current=serialize(amounts[0]),
        previous=serialize(amounts[1]),
        year_ago=serialize(amounts[2]),
        record_count=count,
        status="NO_RECORD"
        if not count
        else "DATA_MISSING"
        if amounts[0]["profit"] is None
        else "OK",
        source_rows=[source for row in rows for source in row.source_rows],
        changes=changes(amounts),
    )


def regroup(rows: list[MetricRow], names: tuple[str, ...]) -> list[MetricRow]:
    pools: dict[tuple[str, ...], list[MetricRow]] = defaultdict(list)
    for row in rows:
        pools[tuple(row.dimensions[name] for name in names)].append(row)
    return [
        merge_rows(items, "|".join(key), " / ".join(key), dict(zip(names, key, strict=True)))
        for key, items in pools.items()
    ]


def overview_row(row: MetricRow, total: MetricRow, maximum: Decimal | None = None) -> OverviewRow:
    deltas = {}
    display_changes = row.changes.copy()
    for period, comparison in (("previous", "mom"), ("year_ago", "yoy")):
        for key in DISPLAY_FIELDS:
            current, base = number(row.current.get(key)), number(getattr(row, period).get(key))
            deltas[f"{key}_{comparison}"] = (
                str(current - base) if current is not None and base is not None else None
            )
            if key in {"units", "revenue"} and current is not None and base:
                # 用完整精度直接格式化，避免先保留两位再显示一位造成二次舍入。
                display_changes[f"{key}_{comparison}"] = f"{(current - base) / base * 100:+.1f}%"
    shares = {
        f"{key}_share": ratio(number(row.current.get(key)), number(total.current.get(key)))
        for key in ("revenue", "profit")
    }
    bar = ratio(number(row.current.get("revenue")), maximum)
    return OverviewRow.model_validate(
        {
            **row.model_dump(),
            **{
                period: {k: v for k, v in getattr(row, period).items() if k in DISPLAY_FIELDS}
                for period in PERIOD_FIELDS
            },
            **{key: str(value) if value is not None else None for key, value in shares.items()},
            "bar_ratio": str(bar) if bar is not None else None,
            "deltas": deltas,
            "changes": display_changes,
        }
    )


def revenue_order(rows: list[MetricRow]) -> list[MetricRow]:
    return sorted(
        rows,
        key=lambda row: (
            row.current.get("revenue") is None,
            -(number(row.current.get("revenue")) or Decimal(0)),
            row.key,
        ),
    )


def overview_details(report: FinancialView, items: list[BasisAnalysis]) -> OverviewDetails:
    total = report.summary
    categories = revenue_order(regroup(report.breakdowns["category3"], ("category3",)))[:10]
    maximum = number(categories[0].current.get("revenue")) if categories else None
    listings = regroup(report.breakdowns["listings"], ("site", "listing"))
    sales = revenue_order(
        [row for row in listings if (number(row.current.get("revenue")) or Decimal(0)) > 0]
    )[:10]
    losses = sorted(
        [row for row in listings if (number(row.current.get("profit")) or Decimal(0)) < 0],
        key=lambda row: (number(row.current.get("profit")) or Decimal(0), row.key),
    )[:10]
    # 原稿店铺表以本期出现的店铺为集合，比较期只追溯该集合。
    shops = revenue_order([row for row in report.breakdowns["shops"] if row.record_count > 0])
    totals = {"": overview_row(merge_rows(shops, "total", "总计", {}), total)}
    for site in sorted({row.dimensions["site"] for row in shops}):
        rows = [row for row in shops if row.dimensions["site"] == site]
        totals[site] = overview_row(
            merge_rows(rows, f"total-{site}", f"{site}站小计", {"site": site}), total
        )
    return OverviewDetails(
        conversion=conversion_changes(items),
        conclusions=overview_conclusions(report.summary, items),
        groups=[overview_row(row, total) for row in report.breakdowns["groups"]],
        sites=[overview_row(row, total) for row in report.breakdowns["sites"]],
        total=overview_row(total, total),
        categories=[overview_row(row, total, maximum) for row in categories],
        sales_top10=[overview_row(row, total) for row in sales],
        loss_top10=[overview_row(row, total) for row in losses],
        shops=[overview_row(row, total) for row in shops],
        shop_totals=totals,
    )
