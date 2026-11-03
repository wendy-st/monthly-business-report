"""在售LISTING和款式分别汇总核算；款式提供非零库存SKU下钻。"""

from collections import defaultdict
from decimal import Decimal

from app.schemas.inventory import InventoryRisk
from app.schemas.reports import ReportFilter
from app.services.financial_model import combine, number, ratio, serialize
from app.services.inventory_assessment import active_listings, listing_key, scope_assessment
from app.services.inventory_details import difference
from app.services.inventory_diagnosis import AGED, LOCAL_SHORT, REDUNDANT, TOTAL_SHORT
from app.services.inventory_forecast import FutureRow, covered_days, forecast_amounts, future_rows
from app.services.inventory_metrics import stock_row, turnover_rows
from app.services.inventory_readiness import all_readiness
from app.services.inventory_sources import InventoryFact, matches
from app.services.report_dataset import ReportDataset
from app.services.report_period import ReportPeriod
from app.services.seasonal_risk import seasonal_risk
from app.services.shipping_standards import shipping_identity, shipping_source


def date_label(value: str) -> str:
    year, month, day = map(int, value.split("-"))
    return f"{year}年{month}月{day}日"


def exhaustion_date(rows: list[FutureRow]) -> str:
    for row in rows:
        days = number(row.support_days)
        if days is not None and days < row.calendar_days:
            return f"{row.month}-{min(row.calendar_days, max(1, round(days))):02}"
    return ""


def season_rows(
    dataset: ReportDataset,
    stocks: list[InventoryFact],
    facts: list[InventoryFact],
    names: tuple[str, ...],
    *,
    filters: ReportFilter | None = None,
) -> list[InventoryRisk]:
    filters = filters or ReportFilter()
    pools: dict[tuple[str, ...], list[InventoryFact]] = defaultdict(list)
    stock_pools: dict[tuple[str, ...], list[InventoryFact]] = defaultdict(list)
    readiness = all_readiness(
        dataset,
        shipping_identity(shipping_source(getattr(dataset, "directory", None), dataset.month)),
    )
    contexts = {}
    for item in facts:
        if item.dimensions["warehouse"] != "本地仓":
            pools[tuple(item.dimensions[name] for name in names)].append(item)
    for item in stocks:
        key = tuple(item.dimensions[name] for name in names)
        stock_pools[key].append(item)
        contexts[key] = dict(zip(names, key, strict=True))
    output = []
    for key, dimensions in sorted(contexts.items()):
        if "style" in names and not dimensions["style"]:
            continue
        scope = filters.model_copy(update=dimensions)
        skus = [
            sku
            for sku in readiness
            if matches(sku.dimensions, scope)
            and listing_key(sku.dimensions) in active_listings(dataset)
            and sku.values.get("has_inventory") != "0"
        ]
        stock_pool = stock_pools[key]
        abroad = [item for item in stock_pool if item.dimensions["warehouse"] != "本地仓"]
        row = stock_row(abroad, "|".join(key), dimensions)
        if not abroad:
            row.values.update(quantity="0", amount="0", in_stock="0", age270="0")
        if not any(number(row.values.get(field)) for field in ("quantity", "amount")) and not skus:
            continue
        forecasts, _ = future_rows(
            dataset, stock_pool, scope, allowed_listings=active_listings(dataset)
        )
        future = [
            item for item in forecasts if item.scope == "FBA+海外仓" and item.scenario == "基础"
        ]
        trend = {
            item.dimensions["month"]: item.values
            for item in turnover_rows(pools[key], ReportFilter(), month=dataset.month)
            if item.dimensions["scope"] == "FBA+海外仓"
        }
        days = trend.get(dataset.month, {}).get("days_qty")
        demand = combine(number(item.demand) for item in future)
        assessment = scope_assessment(dataset, stock_pool, scope)
        forecast, _ = forecast_amounts(dataset, scope, allowed_listings=active_listings(dataset))
        cover, bound = covered_days(number(row.values.get("quantity")), forecast)
        values = {
            **row.values,
            **assessment.values,
            "days_qty": days,
            **serialize(
                {
                    "future_demand": demand,
                    "coverage": ratio(number(row.values.get("quantity")), demand),
                    "abroad_days": cover,
                    "mom_days_qty": difference(
                        days, trend.get(ReportPeriod(dataset.month).months[1], {}).get("days_qty")
                    ),
                    "yoy_days_qty": difference(
                        days, trend.get(ReportPeriod(dataset.month).months[2], {}).get("days_qty")
                    ),
                }
            ),
            "abroad_bound": str(int(bound)),
            "remaining": future[-1].remaining if future else None,
            "forecast_start": future[0].month if future else None,
            "forecast_end": future[-1].month if future else None,
        }
        risk = seasonal_risk(dataset, scope, row.values, future, trend, assessment=assessment)
        categories = sorted(
            {item.dimensions["category3"] for item in stock_pool if item.dimensions["category3"]}
        )
        output.append(
            InventoryRisk(
                key=row.key,
                label=row.label,
                risk=risk,
                dimensions={
                    **dimensions,
                    "category3": "、".join(categories),
                    "issues": assessment.dimensions["issues"],
                },
                values=values,
                exhaustion=exhaustion_date(future),
                skus=skus if "style" in names else [],
            )
        )
    return sorted(
        output,
        key=lambda row: (
            row.risk.level != "未见异常",
            number(row.values.get("amount")) or Decimal(0),
        ),
        reverse=True,
    )


def group_season(
    dataset: ReportDataset,
    stocks: list[InventoryFact],
    facts: list[InventoryFact],
    group: str,
    listings: list[InventoryRisk],
    styles: list[InventoryRisk],
    *,
    filters: ReportFilter | None = None,
) -> InventoryRisk | None:
    if not group:
        return None
    selected = [item for item in stocks if item.dimensions["group"] == group]
    rows = season_rows(dataset, selected, facts, ("group",), filters=filters)
    if not rows:
        return None
    row = rows[0]
    row.values.update(
        flagged_listings=str(sum(item.risk.level != "未见异常" for item in listings)),
        flagged_styles=str(sum(item.risk.level != "未见异常" for item in styles)),
    )
    phases = {item.risk.phase for item in listings}
    peaks = {item.risk.peak_month for item in listings}
    row.risk.phase = next(iter(phases)) if len(phases) == 1 else "多销售季"
    row.risk.peak_month = next(iter(peaks)) if len(peaks) == 1 else ""
    counts = {
        label: sum(label in item.dimensions["issues"].split("；") for item in listings)
        for label in (LOCAL_SHORT, TOTAL_SHORT, REDUNDANT, AGED)
    }
    days, coverage = number(row.values.get("days_qty")), number(row.values.get("coverage"))
    future_text = (
        f"若没有新增补货，预计{date_label(row.exhaustion)}耗尽"
        if row.exhaustion
        else f"预测窗口末余量为{row.values.get('remaining') or '—'}件"
    )
    season_text = f"当前处于{row.risk.phase}"
    if row.risk.peak_month:
        season_text += f"，销售季预测峰值为{row.risk.peak_month}"
    window = f"{row.values.get('forecast_start') or '—'}至{row.values.get('forecast_end') or '—'}"
    coverage_text = (
        f"FBA+海外仓库存覆盖{window}预测需求的{coverage:.1%}"
        if coverage is not None
        else "预测覆盖率暂不可计算"
    )
    label = "薄底水鞋US" if group == "薄底水鞋" else f"{group}组"
    turnover_text = f"当前周转为{days:.1f}天" if days is not None else "当前周转天数暂无有效结果"
    row.core_conclusion = (
        f"{label}的核心结论：{turnover_text}；{season_text}。{coverage_text}，{future_text}。"
        + "，".join(f"{label}{count}个LISTING" for label, count in counts.items())
        + "。"
        "库存冗余按本地仓发货满足率与三仓保底满足率均超过150%判断；库龄单独核查。"
    )
    row.conclusions = [
        f"{item.dimensions['site']} / {item.dimensions['listing']}："
        f"{'；'.join(item.risk.reasons)}。"
        for item in listings
        if item.risk.level != "未见异常"
    ][:3] or ["各LISTING两项库存满足率未触发提示，详细覆盖天数与标准见下方明细。"]
    return row
