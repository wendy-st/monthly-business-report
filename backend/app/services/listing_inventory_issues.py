"""按已确认库存健康规则归纳问题，停运对象仅报告待清理存量。"""

from app.schemas.inventory import InventoryRow
from app.schemas.listing import IssueStatus, ListingIssue
from app.services.financial_model import number
from app.services.inventory_readiness import readiness_summary
from app.services.listing_financial_issues import money
from app.services.seasonal_risk import turnover_health


def cleanup_issue(stock: InventoryRow) -> ListingIssue:
    quantity, amount = number(stock.values.get("quantity")), number(stock.values.get("amount"))
    aged = number(stock.values.get("age270"))
    detail = (
        "库存数量缺失，清理情况待核查"
        if quantity is None
        else (
            "当前无剩余库存"
            if quantity == 0
            else f"待清库存{quantity:,.0f}件，占用{money(amount).lstrip('+')}"
        )
    )
    if aged is not None and aged > 0:
        detail += f"；FBA库龄270天以上{aged:,.0f}件"
    return ListingIssue(
        key="cleanup",
        title="库存清理",
        detail=detail,
        status="待核查" if quantity is None else "关注" if quantity != 0 else "未见异常",
    )


def stock_only_issues(stock: InventoryRow, warehouses: list[str]) -> list[ListingIssue]:
    quantity = number(stock.values.get("quantity"))
    amount = number(stock.values.get("amount"))
    quantity_text = f"{quantity:,.0f}件" if quantity is not None else "数量待核查"
    issues = [
        ListingIssue(
            key="inventory",
            title="无经营记录仍有库存占用",
            detail=f"本期无经营记录；{'、'.join(warehouses)}库存{quantity_text}，占用{money(amount).lstrip('+')}；需明确消化或清理安排",
            status="关注" if quantity is not None and quantity > 0 else "待核查",
        )
    ]
    aged = number(stock.values.get("age270"))
    if aged is not None and aged > 0:
        issues.append(
            ListingIssue(
                key="aged",
                title="长库龄库存待清理",
                detail=f"FBA库龄270天以上{aged:,.0f}件，需优先核查清理安排",
                status="关注",
            )
        )
    return issues


def inventory_issues(
    stock: InventoryRow,
    trend: list[InventoryRow],
    readiness: list[InventoryRow],
) -> list[ListingIssue]:
    values, issues = readiness_summary(readiness)
    known_issues = [text for text in issues if not text.startswith("资料待补充")]
    incomplete = not readiness or int(values["incomplete_skus"] or 0) > 0
    quantity = number(stock.values.get("quantity"))
    aged = number(stock.values.get("age270"))
    if aged is not None and aged > 0:
        known_issues = [text for text in known_issues if not text.startswith("存在270天以上库存")]
        known_issues.append(f"FBA库龄270天以上{aged:,.0f}件")
    description = "；".join(known_issues)
    if incomplete:
        description += ("；" if description else "") + "部分预测或标准缺失，库存健康待核查"
    if not description:
        description = "已核查SKU未见缺货、冗余或长库龄提示"
    coverage = ListingIssue(
        key="inventory",
        title="库存健康",
        detail=description,
        status="关注" if known_issues else "待核查" if incomplete else "未见异常",
    )
    monthly = {
        row.dimensions["month"]: row.values
        for row in trend
        if row.dimensions["scope"] == "所有仓库"
    }
    current = monthly.get("2026-09", {})
    days = number(current.get("days_qty"))
    texts, slower = [], False
    if days is not None:
        texts.append(f"数量周转{days:.1f}天（{turnover_health(days)}）")
        for month, label in (("2026-08", "环比"), ("2025-09", "同比")):
            base = number(monthly.get(month, {}).get("days_qty"))
            if base is not None:
                texts.append(f"{label}{days - base:+.1f}天")
                slower |= days > base
    else:
        texts.append("周转缺少有效流量或库存依据，暂无法计算")
    if quantity is not None:
        texts.append(
            f"库存{quantity:,.0f}件，占用{money(number(stock.values.get('amount'))).lstrip('+')}"
        )
    status: IssueStatus = (
        "待核查"
        if days is None
        else "关注"
        if slower or turnover_health(days) != "健康"
        else "未见异常"
    )
    priorities = {"关注": 0, "待核查": 1, "未见异常": 2}
    coverage.detail = "；".join([*texts, coverage.detail])
    coverage.status = min((coverage.status, status), key=lambda value: priorities[value])
    return [coverage]
