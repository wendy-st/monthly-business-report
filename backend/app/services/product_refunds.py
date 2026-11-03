"""以本期销售数量控制退款率样本，保留原金额退款率及正式利润。"""

from decimal import Decimal
from typing import Literal

from app.schemas.products import ProductRefundView
from app.schemas.reports import FinancialView


def refund_analysis(report: FinancialView, min_sales: int) -> ProductRefundView:
    rows = [row for row in report.breakdowns["styles"] if row.record_count > 0]
    statuses: dict[str, Literal["eligible", "low_sales", "missing_sales"]] = {}
    low_count = missing_count = 0
    total_qty = low_qty = Decimal(0)
    rates: dict[str, Decimal] = {}
    for row in rows:
        quantity = row.current.get("sales_qty")
        if quantity is None:
            missing_count += 1
            statuses[row.key] = "missing_sales"
            continue
        sales_qty = Decimal(quantity)
        total_qty += sales_qty
        if sales_qty < min_sales:
            low_count += 1
            low_qty += sales_qty
            statuses[row.key] = "low_sales"
            continue
        statuses[row.key] = "eligible"
        rate = row.current.get("refund_rate")
        if rate is not None:
            rates[row.key] = Decimal(rate)
    eligible = sorted(rates, key=lambda key: rates[key], reverse=True)
    return ProductRefundView(
        min_sales=min_sales,
        total_styles=len(rows),
        low_sales_count=low_count,
        low_sales_share=str(Decimal(low_count) / len(rows)) if rows else None,
        low_sales_qty_share=str(low_qty / total_qty) if total_qty > 0 else None,
        missing_sales_count=missing_count,
        statuses=statuses,
        eligible_keys=eligible,
        ranking_keys=eligible[:10],
        abnormal_keys=[key for key in eligible if rates[key] > Decimal("0.15")],
    )
