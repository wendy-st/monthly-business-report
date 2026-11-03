"""品类经营分析沿用原报告口径，正式金额与诊断均由后端给出。"""

from app.schemas.products import ProductAnalysis, ProductView
from app.schemas.reports import FinancialView, ReportFilter
from app.services.cost_analysis import exchange_rates
from app.services.financial_model import Amounts, aggregate, number, ratio, serialize
from app.services.financial_report import product_contexts, select_facts
from app.services.product_attribution import COST_KEYS, attribute_costs
from app.services.product_rates import product_rates
from app.services.report_dataset import ReportDataset
from app.services.report_period import ReportPeriod

CURRENCIES = {"US": "USD", "CA": "CAD", "MX": "MXN", "UK": "GBP", "JP": "JPY"}


def product_view(
    dataset: ReportDataset, report: FinancialView, filters: ReportFilter
) -> ProductView:
    for rows in report.breakdowns.values():
        for row in rows:
            for values in (row.current, row.previous, row.year_ago):
                revenue = number(values.get("revenue"))
                operating = ratio(number(values.get("operating_profit")), revenue)
                gross = number(values.get("gross_margin"))
                # 毛利到营业利润的净费用负担，含其他站内费用并抵减FBA赔偿。
                fulfillment = (
                    gross - operating if gross is not None and operating is not None else None
                )
                marketing = number(values.get("marketing"))
                promotion = ratio(-marketing if marketing is not None else None, revenue)
                values["operating_margin"] = str(operating) if operating is not None else None
                values["fulfillment_expense_rate"] = (
                    str(fulfillment) if fulfillment is not None else None
                )
                values["marketing_expense_rate"] = str(promotion) if promotion is not None else None
                # 品类页沿用原报告的账面成本率，保留退款冲回负号。
                for key in COST_KEYS:
                    rate = ratio(number(values.get(key)), revenue)
                    values[key + "_rate"] = str(rate) if rate is not None else None
    report_periods = ReportPeriod(dataset.month).months
    facts = select_facts(dataset, filters)
    all_contexts = product_contexts(dataset)
    rates = exchange_rates(dataset)
    contexts = {}
    for row in report.breakdowns["styles"]:
        if not row.record_count:
            continue
        context = all_contexts[row.key].model_copy()
        site = row.dimensions["site"]
        context.currency = CURRENCIES.get(site, "EUR" if site in {"DE", "IT", "FR", "ES"} else "")
        price = ratio(
            ratio(number(row.current.get("sales_amount")), rates.get((report_periods[0], site))),
            number(row.current.get("sales_qty")),
        )
        context.local_price = str(price) if price is not None else None
        contexts[row.key] = context
    # 搜索子集不能冒用整个小组的成本归因；单款或完整范围才展示。
    unsearched = select_facts(dataset, filters.model_copy(update={"search": ""}))
    current_count = len(contexts)
    scope_available = (
        not filters.search
        or current_count == 1
        or {(fact.source.period, fact.source.row) for fact in facts}
        == {(fact.source.period, fact.source.row) for fact in unsearched}
    )
    comparisons = (
        {
            name: attribute_costs(facts, month, bool(filters.result), current_month=dataset.month)
            for name, month in (("mom", report_periods[1]), ("yoy", report_periods[2]))
        }
        if scope_available
        else {}
    )
    trends = {}
    for key in COST_KEYS:
        trend_values: Amounts = {}
        reasons: dict[str, str | None] = {}
        for field, month in zip(("current", "previous", "year_ago"), report_periods, strict=True):
            period_facts = [fact for fact in facts if fact.source.period == month]
            total = aggregate(fact.amounts for fact in period_facts)
            qty = total["units"]
            trend_values[field] = (
                total[key]
                if key == "other_cost"
                else ratio(total[key], qty if qty is not None and qty > 0 else None)
            )
            reasons[field + "_reason"] = (
                "源表无该范围记录"
                if not period_facts
                else "成本字段缺失"
                if total[key] is None
                else "净销量非正或缺失"
                if trend_values[field] is None
                else ""
            )
        for name, field in (("mom", "previous"), ("yoy", "year_ago")):
            current, base = trend_values["current"], trend_values[field]
            delta = current - base if current is not None and base is not None else None
            trend_values[name + "_delta"] = delta
            trend_values[name + "_change"] = ratio(delta, base) if base and base > 0 else None
        trends[key] = {**serialize(trend_values), **reasons}
    return ProductView(
        **report.model_dump(),
        product=ProductAnalysis(
            style_count=current_count,
            contexts=contexts,
            comparisons=comparisons,
            trends=trends,
            rates=product_rates(dataset, facts) if scope_available else {},
            scope_available=scope_available,
            scope_note="当前选择不对应完整汇总范围，请限定站点、LISTING或单款后查看。"
            if not scope_available
            else "",
        ),
    )
