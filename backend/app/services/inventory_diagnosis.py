"""用覆盖天数解释库存状况；两项满足率均严格超过150%才判定冗余。"""

from decimal import Decimal

from app.services.financial_model import number

REDUNDANCY_RATE = Decimal("1.5")
LOCAL_SHORT = "本地仓覆盖天数低于发货标准"
TOTAL_SHORT = "三仓库存未达到保底需求"
REDUNDANT = "库存冗余"
AGED = "存在270天以上库存"


def coverage_text(values: dict[str, str | None], *, local: bool) -> str:
    days = number(values.get("local_days" if local else "total_days"))
    standard = number(values.get("shipping_days" if local else "order_days"))
    rate = number(values.get("shipping_rate" if local else "order_rate"))
    bound = values.get("local_bound" if local else "total_bound") == "1"
    label = "本地仓" if local else "合计本地仓、FBA及海外仓后"
    target = "发货标准" if local else "保底下单标准"
    if days is None or standard is None or standard <= 0 or rate is None:
        return f"{label}覆盖天数或{target}资料不足，暂无法判断是否达标"
    difference = days - standard
    prefix = "至少" if bound else ""
    comparison = (
        f"{'高于' if difference > 0 else '低于'}{target}{standard:g}天，"
        f"{'超出' if difference > 0 else '缺口'}{abs(difference):.1f}天"
        if difference != 0
        else f"达到{target}{standard:g}天"
    )
    return (
        f"{label}{prefix}可覆盖{days:.1f}天，{prefix}{comparison}"
        f"（满足率{prefix}{rate:.1%}，为标准的{prefix}{rate:.1f}倍）"
    )


def inventory_diagnosis(values: dict[str, str | None]) -> tuple[list[str], str]:
    shipping, order = number(values.get("shipping_rate")), number(values.get("order_rate"))
    flags = []
    if shipping is not None and shipping < 1:
        flags.append(LOCAL_SHORT)
    if order is not None and order < 1:
        flags.append(TOTAL_SHORT)
    if shipping is not None and order is not None:
        if shipping > REDUNDANCY_RATE and order > REDUNDANCY_RATE:
            flags.append(REDUNDANT)
            conclusion = "库存冗余：两项满足率均超过150%"
        elif order < 1:
            conclusion = "三仓库存未达到保底需求，需关注补货安排"
        else:
            conclusion = "整体库存正常"
            if shipping < 1:
                conclusion += "，本地仓需关注发货准备"
    else:
        conclusion = "资料不足，库存状况待核查"
    if (number(values.get("age270")) or 0) > 0:
        flags.append(AGED)
        conclusion += "；存在FBA在库270天以上库存，需另外关注库龄"
    return flags, "；".join(
        [coverage_text(values, local=True), coverage_text(values, local=False), conclusion]
    )
