"""经营权威利润链；缺失字段沿依赖传播，不把空白当作零。"""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Decimal, InvalidOperation

from app.services.workbook_reader import RawRow

Amounts = dict[str, Decimal | None]
ZERO = Decimal(0)
GROUP_ALIASES = {
    "Ash组": "Ash",
    "HCM组": "HCM",
    "LZF组": "LZF",
    "KAYO-北美组": "KAYO-北美",
    "KAYO-欧日组": "KAYO-欧日",
    "JASON/薄底水鞋US": "薄底水鞋",
    "薄底水鞋US": "薄底水鞋",
}
FIELDS = {
    "sales_qty": "销售数量",
    "return_qty": "退货数量",
    "sales_amount": "销售金额",
    "return_amount": "退货金额",
    "purchase": "销售成本",
    "freight": "头程运费",
    "disposal": "赔偿成本&弃置成本",
    "anti_fake": "防伪计划费",
    "delivery": "运费补贴&FBA配送费",
    "buyer_refund": "买家退款处理费",
    "removal": "移除费",
    "unsellable": "不可售成本",
    "liquidation": "清算费",
    "storage_base": "基本月度仓储费",
    "storage_long": "长期仓储费",
    "storage_over": "超量仓储费",
    "storage_util": "仓储利用率附加费",
    "inbound": "入库配置费",
    "overseas": "海外仓费用",
    "commission": "FBA佣金",
    "compensation": "FBA赔偿",
    "rent": "铺租",
    "gift": "礼品补贴",
    "tax": "代收代扣税费",
    "other_fee": "其他扣款费用",
    "vine": "VINE注册费用",
    "promo": "促销折扣",
    "deal": "Deal",
    "coupon": "Coupon",
    "ad": "广告费",
    "offsite": "站外费用",
}
COST_LABELS = {
    "purchase": "销售成本",
    "freight": "头程费用",
    "other_cost": "其他产品成本",
    "delivery": "FBA配送",
    "quality": "FBA质量",
    "storage": "FBA仓储",
    "overseas": "海外仓费用",
    "commission": "FBA佣金",
    "other_platform": "其他站内",
    "compensation": "FBA赔偿",
    "marketing": "营销推广",
}
DEDUCTED = {"purchase", "freight", "other_cost", "overseas"}


def number(value: str | None) -> Decimal | None:
    if value is None or not value.strip():
        return None
    try:
        result = Decimal(value.replace(",", ""))
    except InvalidOperation:
        return None
    return result if result.is_finite() else None


def group_name(value: str | None) -> str:
    text = (value or "").strip()
    return GROUP_ALIASES.get(text, text)


def combine(values: Iterable[Decimal | None]) -> Decimal | None:
    items = list(values)
    if not items or any(item is None for item in items):
        return None
    return sum((item for item in items if item is not None), ZERO)


def equation(amounts: Amounts, terms: dict[str, int]) -> Decimal | None:
    return combine(
        value * sign if (value := amounts.get(key)) is not None else None
        for key, sign in terms.items()
    )


def ratio(numerator: Decimal | None, denominator: Decimal | None) -> Decimal | None:
    return numerator / denominator if numerator is not None and denominator else None


def financials(source: RawRow) -> Amounts:
    result = {key: number(source.get(field)) for key, field in FIELDS.items()}
    return derive(result)


def derive(result: Amounts) -> Amounts:
    """费用保持原符号，只有站外费按业务规则反向。"""
    formulas = {
        "revenue": {"sales_amount": 1, "return_amount": 1},
        "units": {"sales_qty": 1, "return_qty": -1},
        "other_cost": {"disposal": 1, "anti_fake": 1},
        "quality": {"buyer_refund": 1, "removal": 1, "liquidation": 1, "unsellable": -1},
        "storage": {
            "storage_base": 1,
            "storage_long": 1,
            "storage_over": 1,
            "storage_util": 1,
            "inbound": 1,
        },
        "other_platform": {"rent": 1, "gift": 1, "tax": 1, "other_fee": 1, "vine": 1},
        "marketing": {"promo": 1, "deal": 1, "coupon": 1, "ad": 1, "offsite": -1},
        "gross_profit": {"revenue": 1, "purchase": -1, "freight": -1, "other_cost": -1},
        "operating_profit": {
            "gross_profit": 1,
            "delivery": 1,
            "quality": 1,
            "storage": 1,
            "overseas": -1,
            "commission": 1,
            "other_platform": 1,
            "compensation": 1,
        },
        "profit": {"operating_profit": 1, "marketing": 1},
    }
    for key, terms in formulas.items():
        result[key] = equation(result, terms)
    result["margin"] = ratio(result["profit"], result["revenue"])
    result["gross_margin"] = ratio(result["gross_profit"], result["revenue"])
    refund = result["return_amount"]
    result["refund_rate"] = ratio(
        abs(refund) if refund is not None else None, result["sales_amount"]
    )
    result["return_rate"] = ratio(result["return_qty"], result["sales_qty"])
    for key in COST_LABELS:
        value = result[key]
        display = abs(value) if value is not None and key != "compensation" else value
        result[f"{key}_rate"] = ratio(display, result["revenue"])
    return result


def aggregate(rows: Iterable[Amounts]) -> Amounts:
    items = list(rows)
    return derive({key: combine(item.get(key) for item in items) for key in FIELDS})


def serialize(amounts: Amounts) -> dict[str, str | None]:
    return {key: str(value) if value is not None else None for key, value in amounts.items()}
