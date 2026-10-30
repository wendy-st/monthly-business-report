"""季节阶段取当年预测，不将产品资料中的季节标签直接当作计算结果。"""

from decimal import Decimal

from pydantic import BaseModel

from app.schemas.reports import ReportFilter
from app.services.financial_model import combine, number, ratio
from app.services.inventory_forecast import FutureRow, forecast_amounts
from app.services.report_dataset import ReportDataset


class SeasonalRisk(BaseModel):
    phase: str
    peak_month: str
    season_end: str
    health: str
    score: int
    level: str
    reasons: list[str]
    season_end_remaining_rate: str | None
    window_end_remaining_rate: str | None


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
) -> SeasonalRisk:
    forecast, _ = forecast_amounts(dataset, filters, future_only=False)
    yearly = {
        month: value
        for month, value in forecast.items()
        if month.startswith("2026") and value is not None
    }
    peak = max(yearly, key=lambda month: yearly[month] or 0) if yearly else ""
    peak_value = yearly.get(peak)
    active = sorted(
        month
        for month, value in yearly.items()
        if peak_value and value is not None and value >= peak_value / 2
    )
    phase = "无预测"
    end = active[-1] if active else ""
    if active:
        phase = (
            "备货期"
            if "2026-09" < active[0]
            else "旺季"
            if "2026-09" <= peak
            else "季末"
            if "2026-09" <= end
            else "淡季"
        )
    quantity, amount = number(stock.get("quantity")), number(stock.get("amount"))
    days = number(turnover.get("2026-09", {}).get("days_qty"))
    season_row = next((row for row in future if row.month == end), None)
    remaining = (
        quantity
        if end and end <= "2026-09"
        else number(season_row.remaining)
        if season_row
        else None
    )
    season_ratio = ratio(remaining, quantity)
    window_ratio = ratio(number(future[-1].remaining), quantity) if future else None
    demand = combine(number(row.demand) for row in future)
    shortage = next(
        (
            row.month
            for row in future
            if (value := number(row.support_days)) is not None and value < row.calendar_days
        ),
        "",
    )
    reasons: list[str] = []
    score = 0
    material = quantity is not None and quantity >= 300 or amount is not None and amount >= 20000
    if material:
        conditions = [
            (
                quantity is not None and quantity > 0 and (demand == 0 or not future),
                6,
                "有库存但无后续预测需求",
            ),
            (
                phase in {"旺季", "季末", "淡季"}
                and season_ratio is not None
                and season_ratio >= Decimal("0.35"),
                4,
                "季末剩余占比较高",
            ),
            (
                phase == "备货期"
                and quantity is not None
                and demand is not None
                and demand > 0
                and quantity / demand >= Decimal("1.5")
                and window_ratio is not None
                and window_ratio >= Decimal("0.25"),
                3,
                "备货超过窗口需求",
            ),
            (
                phase in {"备货期", "旺季"} and bool(shortage) and shortage <= end,
                6,
                "预计销售季结束前耗尽",
            ),
            (
                phase in {"旺季", "季末", "淡季"} and days is not None and days > 180,
                3,
                "周转超过180天",
            ),
        ]
        for period, label in (("2026-08", "环比"), ("2025-09", "同比")):
            previous = number(turnover.get(period, {}).get("days_qty"))
            conditions.append(
                (
                    days is not None and previous is not None and days - previous > 30,
                    2,
                    f"周转{label}增加超过30天",
                )
            )
        conditions.append((amount is not None and amount >= 300000, 1, "库存金额达到30万元"))
        for applies, points, reason in conditions:
            if applies:
                score += points
                reasons.append(reason)
    return SeasonalRisk(
        phase=phase,
        peak_month=peak if active else "",
        season_end=end,
        health=turnover_health(days),
        score=score,
        level="高风险" if score >= 7 else "关注" if score >= 3 else "正常",
        reasons=reasons,
        season_end_remaining_rate=str(season_ratio) if season_ratio is not None else None,
        window_end_remaining_rate=str(window_ratio) if window_ratio is not None else None,
    )
