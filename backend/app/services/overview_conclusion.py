"""总览总结采用实际经营口径，分析口径按钮不改变总结。"""

from decimal import Decimal

from app.schemas.overview import ConclusionItem
from app.schemas.reports import MetricRow
from app.services.cost_analysis import BasisAnalysis
from app.services.financial_model import COST_LABELS, DEDUCTED, number

SUMMARY_LABELS = {
    **COST_LABELS,
    "freight": "头程运费",
    "other_cost": "其他成本",
    "delivery": "FBA配送成本",
    "quality": "FBA质量成本",
    "storage": "FBA仓储成本",
    "overseas": "海外仓成本",
    "marketing": "营销推广费",
}
RATE_CHANGE_THRESHOLD = Decimal("0.001")


def delta(current: str | None, base: str | None) -> Decimal | None:
    left, right = number(current), number(base)
    return left - right if left is not None and right is not None else None


def impact_text(value: Decimal | None) -> str:
    if value is None:
        return "金额缺失，无法判断影响"
    return f"{abs(value) / 10000:.2f}万{'正向' if value >= 0 else '负向'}影响"


def rate_text(label: str, current: str | None, base: str | None, period: str) -> str:
    value, change = number(current), delta(current, base)
    if value is None:
        return f"{label}缺失"
    prefix = f"{label}{value * 100:.1f}%"
    if change is None:
        return f"{prefix}，无可比数据"
    direction = "上升" if change > 0 else "下降" if change < 0 else "持平"
    return f"{prefix}，{period}{direction}{abs(change) * 100:.1f}pp"


def expense_conclusion(item: BasisAnalysis) -> str:
    rates = [
        (row.key, value)
        for row in item.rows
        if row.key != "compensation" and (value := number(row.delta)) is not None
    ]
    pressure = sorted(
        (row for row in rates if row[1] > RATE_CHANGE_THRESHOLD), key=lambda row: -row[1]
    )[:3]
    improvement = sorted(
        (row for row in rates if row[1] < -RATE_CHANGE_THRESHOLD), key=lambda row: row[1]
    )[:3]

    def describe(rows: list[tuple[str, Decimal]], direction: str) -> str:
        return "、".join(
            f"{SUMMARY_LABELS[key]}{direction}{abs(value) * 100:.1f}pp" for key, value in rows
        )

    parts = []
    if pressure:
        parts.append(f"费用率压力主要来自{describe(pressure, '上升')}。")
    if improvement:
        parts.append(f"费用率改善主要为{describe(improvement, '下降')}。")
    if any(row.delta is None for row in item.rows if row.key != "compensation"):
        parts.append("部分费用缺少可比金额，未纳入排序。")
    return "".join(parts) or "费用率无变化。"


def overview_conclusions(
    summary: MetricRow, analyses: list[BasisAnalysis]
) -> dict[str, list[ConclusionItem]]:
    output = {}
    for item in analyses:
        if item.basis != "actual":
            continue
        period = "环比" if item.comparison == "mom" else "同比"
        current, base = item.current, item.base
        change = delta(current.get("profit"), base.get("profit"))
        result = (
            f"9月净利润{period}{'增加' if change >= 0 else '减少'}{abs(change) / 10000:.2f}万。"
            if change is not None
            else "净利润缺少可比金额，暂不能判断经营结果。"
        )
        previous = summary.previous if item.comparison == "mom" else summary.year_ago
        returns = (
            "；".join(
                rate_text(label, summary.current.get(key), previous.get(key), period)
                for key, label in (("return_rate", "退货率"), ("refund_rate", "退款率"))
            )
            + "。"
        )
        revenue = delta(current.get("revenue"), base.get("revenue"))
        driver = f"收入变化对利润形成{impact_text(revenue)}。"
        # 原报告累计改善利润的成本项目，排除赔偿；不以费用净额替代。
        impacts = [
            value * (-1 if key in DEDUCTED else 1)
            for key in COST_LABELS
            if key != "compensation"
            and (value := delta(current.get(key), base.get(key))) is not None
        ]
        expense = sum((value for value in impacts if value > 0), Decimal(0))
        if len(impacts) != len(COST_LABELS) - 1:
            driver += "部分成本费用金额缺失，暂不能判断收入是否为主要矛盾。"
        elif revenue is not None and revenue < 0 and expense > 0 and expense < -revenue:
            driver += f"成本费用下降形成{impact_text(expense)}"
            driver += (
                "，仍不足以抵消收入下降，收入端疲软是主要矛盾。"
                if expense < -revenue
                else "，抵消了收入下降的影响。"
            )
        compensation = delta(current.get("compensation"), base.get("compensation"))
        output[item.comparison] = [
            ConclusionItem(label="经营结果", detail=result),
            ConclusionItem(label="退货退款", detail=returns),
            ConclusionItem(label="利润驱动", detail=driver),
            ConclusionItem(label="费用率变化", detail=expense_conclusion(item)),
            ConclusionItem(
                label="补偿影响",
                detail=f"FBA赔偿对利润形成{impact_text(compensation)}，"
                "但属于补偿性收入，不计入核心主营盈利能力改善。",
            ),
        ]
    return output
