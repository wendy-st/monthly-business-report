"""复用经营瀑布与三种费用口径，归纳LISTING问题；不将口径差异当作已证实原因。"""

from decimal import Decimal

from app.schemas.listing import ListingIssue
from app.schemas.reports import MetricRow
from app.services.cost_analysis import BasisAnalysis
from app.services.financial_model import COST_LABELS, DEDUCTED, number
from app.services.financial_report import waterfall

COMPARISONS = (("previous", "mom", "环比"), ("year_ago", "yoy", "同比"))


def money(value: Decimal | None) -> str:
    return "—" if value is None else f"{value / 10000:+.2f}万元"


def change(left: Decimal | None, right: Decimal | None) -> str:
    if left is None or right is None:
        return "无可比数据"
    return f"{(left - right) / right:+.1%}" if right > 0 else "基期非正，不算增幅"


def sales_issue(row: MetricRow) -> ListingIssue:
    details, falling, missing = [], False, False
    for period, _, label in COMPARISONS:
        base = getattr(row, period)
        changes = []
        for key, name in (("units", "净销量"), ("revenue", "净收入")):
            left, right = number(row.current.get(key)), number(base.get(key))
            missing |= left is None or right is None
            falling |= left is not None and right is not None and left < right
            changes.append(f"{name}{change(left, right)}")
        details.append(label + "、".join(changes))
    return ListingIssue(
        key="sales",
        title="销售规模下降" if falling else "销售规模核查",
        detail="；".join(details),
        status="关注" if falling else "待核查" if missing else "未见异常",
    )


def profit_issue(row: MetricRow) -> ListingIssue:
    details, falling, missing = [], False, False
    current = {key: number(value) for key, value in row.current.items()}
    profit = current.get("profit")
    if profit is not None and profit < 0:
        details.append(f"本期亏损{money(-profit).lstrip('+')}")
        falling = True
    for period, _, label in COMPARISONS:
        base = {key: number(value) for key, value in getattr(row, period).items()}
        left, right = current.get("profit"), base.get("profit")
        if left is None or right is None:
            details.append(f"{label}利润缺少可比数据")
            missing = True
            continue
        margin, prior = current.get("margin"), base.get("margin")
        valid_margin = (
            margin is not None
            and prior is not None
            and (current.get("revenue") or 0) > 0
            and (base.get("revenue") or 0) > 0
        )
        text = f"{label}净利{money(left - right)}"
        if valid_margin and margin is not None and prior is not None:
            text += f"，净利率{(margin - prior) * 100:+.2f}pp"
        if left < right:
            falling = True
            if (current.get("revenue") or 0) > (base.get("revenue") or 0):
                text += "，增收不增利"
            drags = sorted(
                (
                    step
                    for step in waterfall(current, base)
                    if step.kind == "change" and (number(step.amount) or 0) < 0
                ),
                key=lambda step: number(step.amount) or Decimal(0),
            )[:2]
            text += "，主要拖累：" + "、".join(
                f"{step.label}{money(number(step.amount))}" for step in drags
            )
        elif valid_margin and margin is not None and prior is not None and margin < prior:
            falling = True
            text += "，收入转化效率下降"
        details.append(text)
    return ListingIssue(
        key="profit",
        title="利润与收入转化",
        detail="；".join(details),
        status="关注" if falling else "待核查" if missing else "未见异常",
    )


def cost_issue(items: list[BasisAnalysis]) -> ListingIssue:
    details, missing = [], False
    for _, comparison, label in COMPARISONS:
        actual = next(
            item for item in items if item.comparison == comparison and item.basis == "actual"
        )
        adjusted = next(
            item
            for item in items
            if item.comparison == comparison and item.basis == "price_refund_adjusted"
        )
        # 使用有符号费用负担；费用冲回和赔偿收入下降不得按绝对值误判。
        adverse = sorted(
            (
                row
                for row in actual.business_rows
                if number(row.delta) is not None
                and (number(row.delta) or 0) * (-1 if row.key == "compensation" else 1) > 0
            ),
            key=lambda row: (
                (number(row.delta) or Decimal(0)) * (-1 if row.key == "compensation" else 1)
            ),
            reverse=True,
        )
        missing |= any(row.delta is None for row in actual.business_rows)
        if not adverse:
            continue
        top = adverse[0]
        direction = "占比下降" if top.key == "compensation" else "负担率上升"
        text = f"{label}{top.label}{direction}{abs(number(top.delta) or Decimal(0)) * 100:.2f}pp"
        residual = next(row for row in adjusted.business_rows if row.key == top.key)
        delta = number(residual.delta)
        if delta is not None:
            text += f"，剔价剔退款后变化{delta * 100:+.2f}pp"
        else:
            text += "，还原依据不足"
        details.append(text)
    return ListingIssue(
        key="cost",
        title="成本费用结构",
        detail="；".join(details)
        or (
            "收入非正或缺少可比成本费用，负担率待核查" if missing else "可比成本费用负担率未见上升"
        ),
        status="关注" if details else "待核查" if missing else "未见异常",
    )


def attribution_issue(items: list[BasisAnalysis]) -> ListingIssue:
    details, falling, missing = [], False, False
    for _, comparison, label in COMPARISONS:
        deltas = []
        for basis in ("actual", "price_adjusted", "price_refund_adjusted"):
            item = next(
                item for item in items if item.comparison == comparison and item.basis == basis
            )
            left, right = number(item.current.get("margin")), number(item.base.get("margin"))
            valid = (number(item.current.get("revenue")) or 0) > 0 and (
                number(item.base.get("revenue")) or 0
            ) > 0
            deltas.append(
                left - right if valid and left is not None and right is not None else None
            )
        missing |= any(value is None for value in deltas)
        falling |= any(value is not None and value < 0 for value in deltas)
        text = " → ".join(
            "待核查" if value is None else f"{value * 100:+.2f}pp" for value in deltas
        )
        differences = []
        for name, left, right in (
            ("价格/汇率", deltas[0], deltas[1]),
            ("退款", deltas[1], deltas[2]),
        ):
            if left is not None and right is not None and left < right:
                differences.append(f"{name}差异{(left - right) * 100:+.2f}pp")
        detail = f"{label}净利率变化（实际→剔价→剔价剔退款）：{text}"
        if differences:
            detail += "，负向差异：" + "、".join(differences)
        details.append(detail)
    return ListingIssue(
        key="attribution",
        title="剔价剔退款归因",
        detail="；".join(details),
        status="关注" if falling else "待核查" if missing else "未见异常",
    )


def retired_profit_issues(row: MetricRow | None) -> list[ListingIssue]:
    current = row.current if row else {}
    profit, refund = number(current.get("profit")), number(current.get("return_amount"))
    erosion = []
    for key, label in COST_LABELS.items():
        value = number(current.get(key))
        impact = value * (-1 if key in DEDUCTED else 1) if value is not None else None
        if impact is not None and impact < 0:
            erosion.append((impact, label))
    if refund is not None and refund < 0:
        erosion.append((refund, "退款"))
    erosion.sort()
    known = bool(row and row.record_count)
    return [
        ListingIssue(
            key="erosion",
            title="利润侵蚀",
            detail=f"本期净利润{money(profit)}"
            if profit is not None
            else "本期无经营记录"
            if not known
            else "利润字段缺失，侵蚀金额待核查",
            status="关注"
            if profit is not None and profit < 0
            else "待核查"
            if profit is None
            else "未见异常",
        ),
        ListingIssue(
            key="erosion_cost",
            title="侵蚀来源",
            detail="、".join(f"{label}{money(impact)}" for impact, label in erosion[:3])
            or (
                "已知项目未见负向支出；完整利润待核查"
                if profit is None
                else "本期未见负向费用或退款"
            ),
            status="关注" if erosion else "待核查" if profit is None else "未见异常",
        ),
    ]


def financial_issues(row: MetricRow, items: list[BasisAnalysis]) -> list[ListingIssue]:
    return [sales_issue(row), profit_issue(row), cost_issue(items), attribution_issue(items)]
