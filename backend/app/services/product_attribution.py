"""账面成本先逐款归因再合计，保持缺失、零和无记录的区别。"""

from decimal import Decimal

from app.schemas.products import ProductCostComparison
from app.services.financial_model import Amounts, aggregate, combine, ratio, serialize
from app.services.financial_report import PERIODS, group_facts
from app.services.report_dataset import OperatingFact

COST_KEYS = ("purchase", "freight", "other_cost")
ZERO = Decimal(0)
PARTS = ("quantity", "unit", "other", "unresolved", "added", "removed")
COUNTS = ("known_count", "comparable_count", "missing_count", "added_count", "removed_count")


def split_style(current: Amounts, base: Amounts) -> tuple[dict[str, Decimal], bool]:
    parts = dict.fromkeys(PARTS, ZERO)
    qty, base_qty = current["units"], base["units"]
    comparable = qty is not None and qty > 0 and base_qty is not None and base_qty > 0
    for key in COST_KEYS:
        left, right = current[key], base[key]
        assert left is not None and right is not None
        delta = left - right
        if key == "other_cost":
            parts["other"] += delta
        elif comparable and left >= 0 and right >= 0:
            assert qty is not None and base_qty is not None
            parts["quantity"] += (qty - base_qty) * (right / base_qty)
            parts["unit"] += (left / qty - right / base_qty) * qty
        else:
            parts["unresolved"] += delta
            comparable = False
    return parts, comparable


def money(value: Decimal, signed: bool = True) -> str:
    return f"{value:+,.2f}元" if signed else f"{value:,.2f}元"


def conclusion(values: dict[str, Decimal | None], filtered: bool) -> list[str]:
    def value(key: str) -> Decimal:
        return values[key] or ZERO

    lines = []
    if value("known_count") or value("added_count") or value("removed_count"):
        prefix = "已知对比记录的" if value("missing_count") else ""
        lines.append(
            f"{prefix}三项实际成本变动{money(value('known_delta'))}："
            f"同款净销量变化影响{money(value('quantity'))}，"
            f"单位成本变化影响{money(value('unit'))}，"
            f"同款其他成本实际增减{money(value('other'))}。"
        )
        if value("added_count") or value("removed_count"):
            lines.append(
                f"本期独有记录{int(value('added_count'))}款，成本增量{money(value('added'))}；"
                f"对比期独有记录{int(value('removed_count'))}款，成本变动{money(value('removed'))}。"
                "源表无对比记录不直接认定为新品或退市，不计算基期单位成本或增长率。"
            )
        if value("comparable_count") != value("known_count"):
            lines.append(
                f"净销量非正、负成本等无法按单位成本归因的记录，金额变动{money(value('unresolved'))}"
                f"单独保留；共{int(value('comparable_count'))}/{int(value('known_count'))}款完成单位成本归因。"
            )
    if value("missing_count"):
        amount = values["current_amount"]
        display = money(amount, False) if amount is not None else "不可计算（成本字段缺失）"
        lines.append(
            f"{int(value('missing_count'))}款缺少完整对比数据，不推定为新品或零成本；"
            f"本期三项实际成本合计{display}，全范围成本增减暂不判断。"
        )
    if value("renamed_source_rows"):
        lines.append(
            "已按同站点、同小组、同LISTING的唯一MSKU归属追溯"
            f"{int(value('renamed_source_rows'))}条款式名称变化明细；历史金额只计入一次。"
        )
    lines.append(
        "三期单位成本分别按该期总净成本÷总净销量计算，平均值变化包含款式及尺码结构影响；"
        "单位成本归因按同款逐项计算后相加。"
        + ("盈亏筛选采用本期选中款式集合追溯历史。" if filtered else "范围汇总包含各期全部记录。")
    )
    return lines


def attribute_costs(
    facts: list[OperatingFact], month: str, filtered: bool
) -> ProductCostComparison:
    values: dict[str, Decimal | None] = dict.fromkeys((*PARTS, *COUNTS, "known_delta"), ZERO)
    for pool in group_facts(facts, "styles").values():
        periods = [
            [fact for fact in pool if fact.source.period == period]
            for period in (PERIODS[0], month)
        ]
        if not any(periods):
            continue
        amounts: list[Amounts] = [
            aggregate(fact.amounts for fact in period) if period else dict.fromkeys(COST_KEYS, ZERO)
            for period in periods
        ]
        totals = [combine(item.get(key) for key in COST_KEYS) for item in amounts]
        if any(total is None for total in totals):
            values["missing_count"] = (values["missing_count"] or ZERO) + 1
            continue
        current, base = totals
        assert current is not None and base is not None
        values["known_delta"] = (values["known_delta"] or ZERO) + current - base
        if not all(periods):
            name = "added" if periods[0] else "removed"
            values[name] = (values[name] or ZERO) + (current if periods[0] else -base)
            values[name + "_count"] = (values[name + "_count"] or ZERO) + 1
            continue
        values["known_count"] = (values["known_count"] or ZERO) + 1
        parts, comparable = split_style(amounts[0], amounts[1])
        for key, amount in parts.items():
            values[key] = (values[key] or ZERO) + amount
        values["comparable_count"] = (values["comparable_count"] or ZERO) + int(comparable)
    total = aggregate(fact.amounts for fact in facts if fact.source.period == PERIODS[0])
    values["current_amount"] = combine(total.get(key) for key in COST_KEYS)
    values["actual_delta"] = values["known_delta"] if values["missing_count"] == 0 else None
    values["renamed_source_rows"] = Decimal(
        sum(fact.style_renamed for fact in facts if fact.source.period == month)
    )
    parts_total = sum((values[key] or ZERO for key in PARTS), ZERO)
    if abs(parts_total - (values["known_delta"] or ZERO)) > Decimal("0.00000001"):
        raise ValueError("成本归因与实际金额变化不闭合")
    lines = conclusion(values, filtered)
    label = "环比" if month == PERIODS[1] else "同比"
    lines = [line.replace("三项实际成本变动", f"三项实际成本{label}变动") for line in lines]
    current_styles = group_facts(
        [fact for fact in facts if fact.source.period == PERIODS[0]], "styles"
    )
    if len(current_styles) == 1:
        base_amounts = aggregate(fact.amounts for fact in facts if fact.source.period == month)
        sentences = []
        for key, title in (("purchase", "销售成本"), ("freight", "头程")):
            current_unit, base_unit = (
                ratio(item[key], item["units"])
                if item["units"] is not None and item["units"] > 0
                else None
                for item in (total, base_amounts)
            )
            delta = (
                current_unit - base_unit
                if current_unit is not None and base_unit is not None
                else None
            )
            sentences.append(
                f"{title}单位成本暂无可比数据"
                if delta is None
                else f"{title}平均每件成本持平"
                if abs(delta) < Decimal("0.00005")
                else f"{title}平均每件成本{'增加' if delta > 0 else '减少'}{abs(delta):.4f}元"
            )
        lines = ["；".join(sentences) + "。", *lines[:-1]]
    return ProductCostComparison(values=serialize(values), conclusion=lines)
