"""业务组结论结合经营结果、费用结构和退款桥，不套用公司总览文案。"""

from decimal import Decimal

from app.schemas.overview import ConclusionItem
from app.schemas.reports import MetricRow
from app.services.cost_analysis import BasisAnalysis
from app.services.financial_model import number


def percent_text(value: str | None) -> str:
    amount = number(value)
    return f"{amount * 100:.1f}%" if amount is not None else "不可计算"


def amount_text(value: str | None) -> str:
    amount = number(value)
    return f"{amount / 10000:.2f}万" if amount is not None else "不可计算"


def business_conclusions(
    summary: MetricRow, items: list[BasisAnalysis], scope: str
) -> dict[str, list[ConclusionItem]]:
    output = {}
    for item in items:
        if item.basis != "actual":
            continue
        mode = item.comparison
        label = "环比" if mode == "mom" else "同比"
        base = summary.previous if mode == "mom" else summary.year_ago
        result = (
            f"{scope}：本月销售额{amount_text(summary.current.get('revenue'))}，"
            f"{label}{summary.changes.get('revenue_' + mode) or '不可比较'}；"
            f"净利润{amount_text(summary.current.get('profit'))}，"
            f"{label}{summary.changes.get('profit_' + mode) or '不可比较'}；"
            f"净利率{percent_text(summary.current.get('margin'))}，"
            f"变化{summary.changes.get('margin_' + mode) or '不可比较'}。"
        )
        costs = sorted(
            [row for row in item.rows if row.delta is not None and row.key != "compensation"],
            key=lambda row: abs(number(row.delta) or Decimal(0)),
            reverse=True,
        )[:2]
        structure = (
            "；".join(
                f"{row.label}占比{percent_text(row.current_rate)}，{label}变化"
                f"{(number(row.delta) or Decimal(0)) * 100:+.1f}pp"
                for row in costs
            )
            or "费用率依据不足，暂不能判断变化。"
        )
        bridges = sorted(
            [row for row in item.bridges if row.refund is not None],
            key=lambda row: abs(number(row.refund) or Decimal(0)),
            reverse=True,
        )
        returns = (
            f"退货率{percent_text(summary.current.get('return_rate'))}，"
            f"{label}{summary.changes.get('return_rate_' + mode) or '不可比较'}；"
            f"退款率{percent_text(summary.current.get('refund_rate'))}，"
            f"{label}{summary.changes.get('refund_rate_' + mode) or '不可比较'}。"
        )
        if bridges:
            bridge = bridges[0]
            returns += (
                f"退款因素使{bridge.label}占比额外变化"
                f"{(number(bridge.refund) or Decimal(0)) * 100:+.1f}pp，"
                f"等效影响{amount_text(bridge.equivalent)}；{bridge.judgement}。"
            )
        left, right = number(summary.current.get("revenue")), number(base.get("revenue"))
        driver = "收入比较依据不足。"
        if left is not None and right is not None:
            driver = (
                "收入收缩对利润形成压力。"
                if left < right
                else "收入增长对利润形成支持。"
                if left > right
                else "收入规模持平。"
            )
        if costs:
            driver += f"重点关注{costs[0].label}占比变化；费用变动及退款影响见下方拆解。"
        output[mode] = [
            ConclusionItem(label="经营结果", detail=result),
            ConclusionItem(label="成本结构", detail=structure),
            ConclusionItem(label="退货退款与退款影响", detail=returns),
            ConclusionItem(label="综合判断", detail=driver),
        ]
    return output
