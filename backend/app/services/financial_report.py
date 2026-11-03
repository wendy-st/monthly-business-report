"""三期财务查询、分组和筛选统一在后端完成。"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal
from functools import lru_cache

from app.schemas.products import ProductStyleContext
from app.schemas.reports import FinancialView, MetricRow, ReportFilter, WaterfallStep
from app.services.financial_model import (
    COST_LABELS,
    DEDUCTED,
    Amounts,
    aggregate,
    serialize,
)
from app.services.product_diagnosis import diagnose_styles
from app.services.report_dataset import OperatingFact, ReportDataset
from app.services.report_period import ReportPeriod

PERIODS = ReportPeriod().months
DIMENSIONS = ("group", "site", "category1", "category2", "category3", "listing", "style")
GRAINS = {
    "groups": ("group",),
    "sites": ("site",),
    "categories": ("category1",),
    "category2": ("category1", "category2"),
    "category3": ("category1", "category2", "category3"),
    "listings": ("group", "site", "listing"),
    "styles": ("group", "site", "listing", "category1", "category2", "category3", "style"),
    "shops": ("shop", "site"),
}


def dimensions(fact: OperatingFact) -> dict[str, str]:
    return {
        **{name: getattr(fact.source, name) for name in DIMENSIONS},
        "shop": fact.source.raw.get("店铺:站点") or "未填写店铺",
    }


def select_facts(dataset: ReportDataset, filters: ReportFilter) -> list[OperatingFact]:
    result = []
    for fact in dataset.operating:
        values = dimensions(fact)
        if filters.listing_site and filters.listing_site != values["site"]:
            continue
        if any(
            getattr(filters, key)
            and not (
                key == "site"
                and filters.site == "DE/IT/FR/ES"
                and values[key] in {"DE", "IT", "FR", "ES"}
            )
            and getattr(filters, key) != values[key]
            for key in DIMENSIONS
        ):
            continue
        if (
            filters.search
            and filters.search.casefold()
            not in " ".join(values[key] for key in ("listing", "style", "category3")).casefold()
        ):
            continue
        result.append(fact)
    if not filters.result:
        return result
    # 盈亏以本期款式集合确定，比较期只追溯同一集合，不按历史盈亏再次筛选。
    pools = group_facts([fact for fact in result if fact.source.period == dataset.month], "styles")
    selected = set()
    for key, facts in pools.items():
        profit = aggregate(fact.amounts for fact in facts)["profit"]
        if profit is not None and (profit >= 0) == (filters.result == "盈利"):
            selected.add(key)
    return [fact for fact in result if grain_key(fact, GRAINS["styles"]) in selected]


def grain_key(fact: OperatingFact, grain: tuple[str, ...]) -> tuple[str, ...]:
    values = dimensions(fact)
    return tuple(values[name] for name in grain)


def group_facts(
    facts: Iterable[OperatingFact], grain: str
) -> dict[tuple[str, ...], list[OperatingFact]]:
    pools: dict[tuple[str, ...], list[OperatingFact]] = defaultdict(list)
    for fact in facts:
        pools[grain_key(fact, GRAINS[grain])].append(fact)
    return pools


def metric_row(
    facts: list[OperatingFact],
    key: str,
    label: str,
    values: dict[str, str] | None = None,
    *,
    periods: tuple[str, str, str] = PERIODS,
) -> MetricRow:
    amounts = [
        aggregate(fact.amounts for fact in facts if fact.source.period == month)
        for month in periods
    ]
    current = [fact for fact in facts if fact.source.period == periods[0]]
    status = "OK" if current else "NO_RECORD"
    if current and any(amounts[0][name] is None for name in ("revenue", "profit", "units")):
        status = "DATA_MISSING"
    return MetricRow(
        key=key,
        label=label,
        dimensions=values or {},
        current=serialize(amounts[0]),
        previous=serialize(amounts[1]),
        year_ago=serialize(amounts[2]),
        record_count=len(current),
        status=status,
        source_rows=[fact.source.row for fact in current],
        changes=changes(amounts),
    )


def changes(amounts: list[Amounts]) -> dict[str, str | None]:
    output: dict[str, str | None] = {}
    for index, comparison in ((1, "mom"), (2, "yoy")):
        for key in (
            "units",
            "revenue",
            "profit",
            "margin",
            "refund_rate",
            "return_rate",
            *[f"{item}_rate" for item in COST_LABELS],
        ):
            current, base = amounts[0].get(key), amounts[index].get(key)
            if current is None or base is None:
                display = "无可比数据"
            elif key == "margin" or key.endswith("_rate"):
                display = f"{(current - base) * 100:+.2f}pp"
            elif base == 0:
                display = "基期为零"
            else:
                display = f"{(current - base) / base * 100:+.2f}%"
            output[f"{key}_{comparison}"] = display
    return output


def breakdown(
    facts: list[OperatingFact], grain: str, *, periods: tuple[str, str, str] = PERIODS
) -> list[MetricRow]:
    rows = [
        metric_row(
            items,
            "|".join(key),
            " / ".join(key),
            dict(zip(GRAINS[grain], key, strict=True)),
            periods=periods,
        )
        for key, items in group_facts(facts, grain).items()
    ]
    return sorted(
        rows,
        key=lambda row: (
            row.current.get("revenue") is None,
            -(aggregate_value(row.current, "revenue")),
        ),
    )


def aggregate_value(values: dict[str, str | None], key: str) -> Decimal:
    value = values.get(key)
    return Decimal(value) if value is not None else Decimal(0)


def waterfall(current: Amounts, base: Amounts) -> list[WaterfallStep]:
    result = [
        WaterfallStep(
            label="对比期净利润",
            amount=str(base["profit"]) if base["profit"] is not None else None,
            kind="total",
        )
    ]
    for key, label in {"revenue": "收入变化", **COST_LABELS}.items():
        left, right = current.get(key), base.get(key)
        change = (
            (left - right) * (-1 if key in DEDUCTED else 1)
            if left is not None and right is not None
            else None
        )
        result.append(
            WaterfallStep(
                label=label, amount=str(change) if change is not None else None, kind="change"
            )
        )
    result.append(
        WaterfallStep(
            label="本期净利润",
            amount=str(current["profit"]) if current["profit"] is not None else None,
            kind="total",
        )
    )
    return result


def financial_view(dataset: ReportDataset, filters: ReportFilter) -> FinancialView:
    facts = select_facts(dataset, filters)
    periods = ReportPeriod(dataset.month).months
    summary = metric_row(facts, "summary", "当前范围", periods=periods)
    per_period = {
        month: aggregate(fact.amounts for fact in facts if fact.source.period == month)
        for month in periods
    }
    warnings = []
    if summary.status == "DATA_MISSING":
        warnings.append("存在缺失数值，受影响利润项不可计算；请在来源核验中检查字段。")
    if any(fact.source.group == "未分配" for fact in facts):
        warnings.append("包含责任归属未分配记录，保留在公司合计，不自动分摊。")
    breakdowns = {name: breakdown(facts, name, periods=periods) for name in GRAINS}
    diagnoses = product_diagnoses(dataset)
    for row in breakdowns["styles"]:
        row.diagnosis = diagnoses.get(row.key, "待核验")
    return FinancialView(
        report_month=dataset.month,
        summary=summary,
        series=[
            metric_row(
                [fact for fact in facts if fact.source.period == month],
                month,
                month,
                periods=periods,
            ).model_copy(update={"current": serialize(per_period[month])})
            for month in reversed(periods)
        ],
        breakdowns=breakdowns,
        waterfall={
            kind: waterfall(per_period[periods[0]], per_period[month])
            for kind, month in (("mom", periods[1]), ("yoy", periods[2]))
        },
        options=filter_options(dataset, filters),
        warnings=warnings,
        snapshot_id=dataset.manifest["identity"],
    )


def filter_options(dataset: ReportDataset, filters: ReportFilter) -> dict[str, list[str]]:
    output = {}
    for index, key in enumerate(DIMENSIONS):
        candidates = [
            fact
            for fact in dataset.operating
            if fact.source.period == dataset.month
            and all(
                not getattr(filters, previous)
                or getattr(filters, previous) == dimensions(fact)[previous]
                for previous in DIMENSIONS[:index]
            )
        ]
        output[key] = sorted(
            {dimensions(fact)[key] for fact in candidates if dimensions(fact)[key]}
        )
    return output


@lru_cache(maxsize=1)
def product_contexts(dataset: ReportDataset) -> dict[str, ProductStyleContext]:
    return diagnose_styles(
        breakdown(dataset.operating, "styles", periods=ReportPeriod(dataset.month).months)
    )


def product_diagnoses(dataset: ReportDataset) -> dict[str, str]:
    return {key: context.diagnosis for key, context in product_contexts(dataset).items()}
