"""历史源表字段、归组和冻结利润汇总；供年度报告及退款回溯共用。"""

from collections import defaultdict

from app.schemas.reports import MetricRow
from app.services.financial_model import (
    Amounts,
    aggregate,
    combine,
    financials,
    number,
    ratio,
    serialize,
)
from app.services.source_import import SourceRecord

HISTORICAL_NAMES = {
    "赔偿成本&弃置成本": "赔偿成本",
    "基本月度仓储费": "基础仓储费",
    "海外仓费用": "海外仓",
    "FBA佣金": "佣金",
    "FBA赔偿": "赔偿",
    "礼品补贴": "礼品卡补贴",
}

# 原9月报告 productPositions 中的已确认手工覆盖，仅用于该报告期。
# 保留原稿权威定位，不能用当前款式定位冲突替换这些人工结论。
SEPTEMBER_POSITION_OVERRIDES = {
    ("HCM", "US", "SG902"): "维护",
    ("KAYO-欧日", "DE", "SG902"): "已停运",
    ("HCM", "US", "VG501"): "已停运",
    ("Ash", "CA", "SA001"): "已停运",
    ("KAYO-北美", "US", "RG802"): "已停运",
    ("KAYO-欧日", "DE", "CHG001"): "已停运",
    ("KAYO-欧日", "JP", "SG930"): "维护",
    ("KAYO-欧日", "UK", "SK001"): "废弃",
}


def historical_group(source: SourceRecord) -> str:
    if source.group == "KAYO":
        if source.site in {"US", "MX", "CA"}:
            return "KAYO-北美"
        if source.site in {"UK", "DE", "FR", "IT", "ES", "JP"}:
            return "KAYO-欧日"
    if (
        source.group == "JASON"
        and source.site in {"US", "MX"}
        and source.listing in {"SK001", "SK002", "SWS001", "SWS002"}
    ):
        return "薄底水鞋"
    return source.group or "未分配"


def historical_amounts(source: SourceRecord) -> Amounts:
    raw = source.raw.copy()
    for target, origin in HISTORICAL_NAMES.items():
        raw[target] = raw.get(origin)
    # 复用已确认的专项口径：历史入库配置费空白为零，其他缺失不补零。
    if not (raw.get("入库配置费") or "").strip():
        raw["入库配置费"] = "0"
    result = financials(raw)
    result["gross_profit"] = number(raw.get("主营业务利润"))
    result["operating_profit"] = number(raw.get("产品营业利润"))
    result["profit"] = number(raw.get("产品净利润"))
    result["margin"] = ratio(result["profit"], result["revenue"])
    result["gross_margin"] = ratio(result["gross_profit"], result["revenue"])
    return result


def frozen_summary(records: list[SourceRecord], key: str, values: dict[str, str]) -> MetricRow:
    rows = [historical_amounts(source) for source in records]
    amounts = aggregate(rows)
    for metric in ("gross_profit", "operating_profit", "profit"):
        amounts[metric] = combine(item[metric] for item in rows)
    amounts["margin"] = ratio(amounts["profit"], amounts["revenue"])
    amounts["gross_margin"] = ratio(amounts["gross_profit"], amounts["revenue"])
    return MetricRow(
        key=key,
        label=" / ".join(values.values()),
        dimensions=values,
        current=serialize(amounts),
        previous={},
        year_ago={},
        record_count=len(records),
        status="NO_RECORD"
        if not records
        else "DATA_MISSING"
        if amounts["profit"] is None
        else "OK",
        source_rows=[item.row for item in records],
    )


def history_rows(records: list[SourceRecord], grain: str) -> list[MetricRow]:
    pools: dict[tuple[str, ...], list[SourceRecord]] = defaultdict(list)
    for source in records:
        key: tuple[str, ...]
        names: tuple[str, ...]
        if grain == "annual":
            key = (source.period[:4],)
            names = ("year",)
        elif grain == "quarterly":
            key = (f"{source.period[:4]}-Q{(int(source.period[5:]) - 1) // 3 + 1}",)
            names = ("quarter",)
        elif grain == "monthly":
            key = (source.period,)
            names = ("month",)
        else:
            key = (historical_group(source), source.site, source.listing)
            names = ("group", "site", "listing")
        pools[key].append(source)
    return (
        [
            frozen_summary(items, "|".join(key), dict(zip(names, key, strict=True)))
            for key, items in sorted(pools.items())
        ]
        if pools
        else []
    )
