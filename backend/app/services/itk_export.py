"""CSV导出保留空值、原始比例及全部筛选行，不限于当前分页。"""

import csv
import io
from decimal import Decimal

from app.schemas.itk import ComparisonView, Row

OVERVIEW_HEADERS = [
    "年月",
    "站点",
    "币种（按站点展示）",
    "品类",
    "人群",
    "细分类型",
    "品牌",
    "销售额",
    "销量",
    "退货量",
    "退货率",
    "平均售价",
    "源记录数",
    "销售额有效记录数",
    "销量有效记录数",
    "退货量有效记录数",
    "含负数记录数",
    "辅助品牌补充记录数",
    "数据情况",
]
OVERVIEW_FIELDS = [
    "month",
    "site",
    "currency",
    "category",
    "audience",
    "kind",
    "brand",
    "sales",
    "units",
    "returns",
    "rate",
    "asp",
    "count",
    "sales_count",
    "units_count",
    "returns_count",
    "negative_count",
    "fallback_count",
    "status",
]
COMPARE_HEADERS = [
    "目标品牌",
    "站点",
    "品类",
    "人群",
    "细分类型",
    "年月",
    "对比品牌",
    "销量",
    "销售额",
    "币种（按站点展示）",
    "退货量",
    "退货率",
    "记录情况",
    "所选期间起始",
    "所选期间结束",
    "期间销量同类排名",
    "期间销售额同类排名",
    "同类品牌数",
    "同期最低退货率竞品",
    "最低竞品同月退货率",
    "最低竞品期间退货率",
    "目标品牌同期差距（百分点）",
]
SORT_FIELDS = {"month", "brand", "sales", "units", "returns", "rate", "asp"}


def category_label(row: Row) -> str:
    return " / ".join(
        [
            row.category,
            *([] if row.audience == "未标注" else [row.audience]),
            *([] if row.kind == row.category else [row.kind]),
        ]
    )


def detail_rows(rows: list[Row], search: str, sort: str, descending: bool) -> list[Row]:
    if sort not in SORT_FIELDS:
        raise ValueError("排序字段无效")
    search = search.strip().casefold()
    filtered = [r for r in rows if search in f"{r.brand} {category_label(r)}".casefold()]
    filtered.sort(key=lambda r: (r.site, category_label(r), r.brand))
    valid = [r for r in filtered if getattr(r, sort) is not None]
    missing = [r for r in filtered if getattr(r, sort) is None]
    return sorted(valid, key=lambda r: getattr(r, sort), reverse=descending) + missing


def cell(value: object) -> object:
    # 文本公式转义；数值负数仍按数值导出。
    if isinstance(value, str) and value.startswith(("=", "+", "@", "-")):
        return "'" + value
    return "" if value is None else value


def encode(headers: list[str], rows: list[list[object]]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    writer.writerow(headers)
    writer.writerows([[cell(value) for value in row] for row in rows])
    return ("\ufeff" + stream.getvalue()).encode("utf-8")


def overview_csv(rows: list[Row]) -> bytes:
    data = []
    for row in rows:
        values = []
        for field in OVERVIEW_FIELDS:
            value = getattr(row, field)
            if field in {"sales", "asp"} and value is not None:
                value = value.quantize(Decimal("0.01"))
            values.append(value)
        data.append(values)
    return encode(OVERVIEW_HEADERS, data)


def comparison_csv(view: ComparisonView) -> bytes:
    scope, lowest = view.scope, view.lowest
    series = {s.brand: s.points for s in view.series}
    summaries = {s.brand: s for s in view.summaries}
    data: list[list[object]] = []
    for index, month in enumerate(view.months):
        low_point = series[lowest.brand][index] if lowest else None
        for brand in view.selected:
            point, summary = series[brand][index], summaries[brand]
            data.append(
                [
                    scope.target,
                    scope.site,
                    scope.category,
                    scope.audience,
                    scope.kind,
                    month,
                    brand,
                    point.units if point else None,
                    point.sales if point else None,
                    view.currency,
                    point.returns if point else None,
                    point.rate if point else None,
                    (
                        f"有记录；含负数 {point.negative_count} 条"
                        if point.negative_count
                        else "有记录"
                    )
                    if point
                    else "缺失月份，未补零",
                    scope.start,
                    scope.end,
                    summary.units_rank,
                    summary.sales_rank,
                    len(view.pool),
                    lowest.brand if lowest else None,
                    low_point.rate if low_point else None,
                    lowest.rate if lowest else None,
                    view.rate_gap * 100 if view.rate_gap is not None else None,
                ]
            )
    return encode(COMPARE_HEADERS, data)
