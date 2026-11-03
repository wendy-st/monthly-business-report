"""原报告相对诊断：同组同站点LISTING优先，二级品类备用。"""

from decimal import Decimal

from app.schemas.products import ProductStyleContext
from app.schemas.reports import MetricRow
from app.services.financial_model import number, ratio


def diagnose_styles(rows: list[MetricRow]) -> dict[str, ProductStyleContext]:
    valid = [
        row
        for row in rows
        if (number(row.current.get("revenue")) or 0) > 0
        and row.current.get("gross_margin") is not None
    ]
    output = {}
    for row in rows:
        context = ProductStyleContext()
        if row in valid:
            for grain, basis in (
                (("group", "site", "listing"), "同LISTING基准"),
                (("group", "site", "category2"), "同品类备用基准"),
            ):
                pool = [
                    item
                    for item in valid
                    if all(item.dimensions[key] == row.dimensions[key] for key in grain)
                ]
                if len(pool) < 2:
                    continue
                revenue = sum(
                    (number(item.current.get("revenue")) or Decimal(0) for item in pool), Decimal(0)
                )
                gross = sum(
                    (number(item.current.get("gross_profit")) or Decimal(0) for item in pool),
                    Decimal(0),
                )
                benchmark = ratio(gross, revenue)
                context.basis = basis
                context.benchmark = str(benchmark) if benchmark is not None else None
                margin = number(row.current.get("gross_margin"))
                profit = number(row.current.get("profit"))
                context.diagnosis = (
                    "产品成本问题"
                    if margin is not None and benchmark is not None and margin < benchmark
                    else "费用端问题"
                    if profit is not None and profit < 0
                    else "健康盈利"
                )
                break
        output[row.key] = context
    return output
