"""销售季来自产品资料；不再套用旧版季节风险打分。"""

from decimal import Decimal

from app.schemas.inventory import InventoryRow
from app.schemas.inventory import SeasonalRisk as SeasonalRisk
from app.schemas.reports import ReportFilter
from app.services.financial_model import number, ratio
from app.services.inventory_forecast import FutureRow
from app.services.inventory_readiness import all_readiness, readiness_summary
from app.services.inventory_seasons import season_context
from app.services.inventory_sources import matches
from app.services.report_dataset import ReportDataset
from app.services.shipping_standards import shipping_identity, shipping_source


def turnover_health(value: Decimal | None) -> str:
    if value is None:
        return "无动销"
    return (
        "健康" if value <= 60 else "关注" if value <= 90 else "压力" if value <= 180 else "高风险"
    )


def seasonal_risk(
    dataset: ReportDataset,
    filters: ReportFilter,
    stock: dict[str, str | None],
    future: list[FutureRow],
    turnover: dict[str, dict[str, str | None]],
    *,
    assessment: InventoryRow | None = None,
) -> SeasonalRisk:
    phase, start, end, peak = season_context(dataset, filters)
    current = str(dataset.manifest["report_month"])
    quantity = number(stock.get("quantity"))
    season_row = next((row for row in future if row.month == end), None)
    # 季末不在预测窗口时不再借用窗口末余量冒充季末余量。
    remaining = quantity if end == current else number(season_row.remaining) if season_row else None
    season_ratio = ratio(remaining, quantity)
    window_ratio = ratio(number(future[-1].remaining), quantity) if future else None
    if assessment is None:
        skus = [
            row
            for row in all_readiness(
                dataset,
                shipping_identity(
                    shipping_source(getattr(dataset, "directory", None), dataset.month)
                ),
            )
            if matches(row.dimensions, filters)
        ]
        summary, issues = readiness_summary(skus)
        incomplete = bool(int(summary["incomplete_skus"] or 0))
        flagged = any(
            int(summary[k] or 0)
            for k in ("shipping_short", "order_short", "redundant_skus", "aged_skus")
        )
    else:
        flagged = bool(assessment.dimensions["issues"])
        incomplete = bool(assessment.dimensions["notes"])
        issues = [assessment.dimensions["diagnosis"]]
        if assessment.dimensions["notes"]:
            issues.append(assessment.dimensions["notes"])
    if phase in {"季节资料待确认", "缺少季节资料"}:
        issues.append(phase)
        incomplete = True
    level = "有提示" if flagged else "待补充" if incomplete else "未见异常"
    return SeasonalRisk(
        phase=phase,
        peak_month=peak,
        season_start=start,
        season_end=end,
        health=turnover_health(number(turnover.get(current, {}).get("days_qty"))),
        score=0,
        level=level,
        reasons=issues,
        season_end_remaining_rate=str(season_ratio) if season_ratio is not None else None,
        window_end_remaining_rate=str(window_ratio) if window_ratio is not None else None,
    )
