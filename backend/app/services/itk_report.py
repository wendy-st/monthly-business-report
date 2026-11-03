"""ITK大盘概览与品牌同类对比；峰值、排名和已选竞品范围独立。"""

from collections import defaultdict
from decimal import Decimal
from typing import Literal, cast

from app.schemas.itk import (
    Benchmark,
    BrandSeries,
    BrandSummary,
    CategoryOption,
    ComparisonScope,
    ComparisonView,
    Metrics,
    NamedMetrics,
    OverviewView,
    Row,
    Scope,
)
from app.services.itk_data import (
    aggregate,
    currency,
    dataset,
    filter_rows,
    grouped,
    normalize,
    site_order,
)

Metric = Literal["sales", "units"]


def overview(scope: Scope) -> OverviewView:
    scope = normalize(scope)
    candidates = filter_rows(scope, include_brand=False)
    brands = sorted({r.brand for r in candidates})
    if scope.brand not in brands:
        scope = scope.model_copy(update={"brand": ""})
    rows = [r for r in candidates if not scope.brand or r.brand == scope.brand]
    _, options = dataset()
    by_month = {r.name: r for r in grouped(rows, "month")}
    trend = [
        by_month.get(m, NamedMetrics(name=m))
        for m in options.months
        if scope.start <= m <= scope.end
    ]
    return OverviewView(
        scope=scope,
        currency=currency(scope.site),
        brands=brands,
        totals=aggregate(list(rows)),
        trend=trend,
        ranking=grouped(rows, "brand"),
        composition=grouped(rows, "category"),
        rows=rows,
    )


def own_peak(points: list[NamedMetrics], metric: Metric) -> NamedMetrics | None:
    valid = [p for p in points if getattr(p, metric) is not None]
    return max(valid, key=lambda p: getattr(p, metric)) if valid else None


def rank(summaries: list[BrandSummary], metric: Metric) -> None:
    valid = sorted(
        [s for s in summaries if getattr(s, metric) is not None],
        key=lambda s: (-getattr(s, metric), s.brand),
    )
    previous: Decimal | None = None
    position = 0
    for index, item in enumerate(valid):
        value = getattr(item, metric)
        if value != previous:
            position = index + 1
        setattr(item, f"{metric}_rank", position)
        setattr(item, f"{metric}_total", len(valid))
        previous = value


def benchmark(
    series: dict[str, list[NamedMetrics]], target: str, metric: Metric
) -> Benchmark | None:
    valid = [
        (getattr(p, metric), p.name, brand)
        for brand, points in series.items()
        for p in points
        if getattr(p, metric) is not None and getattr(p, metric) > 0
    ]
    if not valid:
        return None
    value, month, brand = min(valid, key=lambda entry: (-entry[0], entry[1], entry[2]))
    target_value = next(
        (getattr(p, metric) for p in series.get(target, []) if p.name == month), None
    )
    return Benchmark(
        brand=brand,
        month=month,
        value=value,
        target=target_value,
        gap=target_value - value if target_value is not None else None,
    )


def selection_order(item: BrandSummary) -> tuple[bool, Decimal, bool, Decimal, str]:
    return (
        item.sales is None,
        -(item.sales or Decimal(0)),
        item.units is None,
        -(item.units or Decimal(0)),
        item.brand,
    )


def comparison(scope: ComparisonScope) -> ComparisonView:
    rows, options = dataset()
    target_rows = [r for r in rows if r.brand == scope.target]
    sites = sorted({r.site for r in target_rows}, key=site_order)
    site = scope.site if scope.site in sites else sites[0]
    scope = cast(ComparisonScope, normalize(scope.model_copy(update={"site": site})))
    categories = category_options(target_rows, scope)
    keys = [(c.category, c.audience, c.kind) for c in categories]
    current = (scope.category, scope.audience, scope.kind)
    if current not in keys:
        scope = scope.model_copy(
            update=dict(zip(("category", "audience", "kind"), keys[0], strict=True))
        )
    pool_rows = [r for r in filter_rows(scope, include_brand=False) if r.kind == scope.kind]
    months = [m for m in options.months if scope.start <= m <= scope.end]
    series, summaries = brand_metrics(pool_rows)
    rank(summaries, "units")
    rank(summaries, "sales")
    pool = sorted(summaries, key=lambda s: (s.sales is None, -(s.sales or 0), s.brand))
    allowed = {s.brand for s in summaries if s.brand != scope.target}
    peers = (
        [s.brand for s in sorted(summaries, key=selection_order) if s.brand != scope.target][:5]
        if scope.peers is None
        else list(dict.fromkeys(p for p in scope.peers if p in allowed))
    )
    selected = [scope.target, *peers]
    by_brand = {s.brand: s for s in summaries}
    chosen = [by_brand.get(b, BrandSummary(brand=b, months=0)) for b in selected]
    valid = [s for s in chosen[1:] if s.rate is not None]
    lowest = min(valid, key=lambda s: (cast(Decimal, s.rate), s.brand)) if valid else None
    target_rate = chosen[0].rate
    gap = target_rate - cast(Decimal, lowest.rate) if target_rate is not None and lowest else None
    chart_series = []
    for brand in selected:
        points = {p.name: p for p in series.get(brand, [])}
        chart_series.append(BrandSeries(brand=brand, points=[points.get(m) for m in months]))
    return ComparisonView(
        scope=scope,
        currency=currency(scope.site),
        sites=sites,
        categories=categories,
        months=months,
        pool=pool,
        selected=selected,
        summaries=chosen,
        series=chart_series,
        units_peak=benchmark(series, scope.target, "units"),
        sales_peak=benchmark(series, scope.target, "sales"),
        lowest=lowest,
        rate_gap=gap,
    )


def category_options(rows: list[Row], scope: ComparisonScope) -> list[CategoryOption]:
    groups: dict[tuple[str, str, str], list[Metrics]] = defaultdict(list)
    for row in rows:
        if row.site == scope.site:
            key = (row.category, row.audience, row.kind)
            groups.setdefault(key, [])
            if scope.start <= row.month <= scope.end:
                groups[key].append(row)
    ordered = sorted(groups, key=lambda key: (-(aggregate(groups[key]).units or 0), "/".join(key)))
    return [CategoryOption(category=c, audience=a, kind=k) for c, a, k in ordered]


def brand_metrics(rows: list[Row]) -> tuple[dict[str, list[NamedMetrics]], list[BrandSummary]]:
    groups: dict[str, list[Row]] = defaultdict(list)
    for row in rows:
        groups[row.brand].append(row)
    series = {
        b: sorted(grouped(items, "month"), key=lambda p: p.name) for b, items in groups.items()
    }
    summaries = [
        BrandSummary(
            brand=b,
            months=len(series[b]),
            **aggregate(list(items)).model_dump(),
            units_peak=own_peak(series[b], "units"),
            sales_peak=own_peak(series[b], "sales"),
        )
        for b, items in groups.items()
    ]
    return series, summaries
