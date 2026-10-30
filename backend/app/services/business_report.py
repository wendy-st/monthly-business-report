"""业务组展示在后端完成汇率、占比、小计与三期比较，不裁掉历史MX。"""

from decimal import Decimal

from app.schemas.business import BusinessDetails, BusinessRow
from app.schemas.reports import FinancialView, MetricRow, ReportFilter
from app.services.business_conclusion import business_conclusions
from app.services.cost_analysis import BasisAnalysis, exchange_rates
from app.services.financial_model import combine, number, ratio
from app.services.financial_report import breakdown, select_facts
from app.services.listing_report import listing_positions
from app.services.overview_report import conversion_changes, regroup, revenue_order
from app.services.report_dataset import ReportDataset

CURRENCIES = {"US": "USD", "CA": "CAD", "MX": "MXN", "UK": "GBP", "JP": "JPY"}
PERIODS = {"current": "2026-09", "previous": "2026-08", "year_ago": "2025-09"}


def business_row(
    row: MetricRow,
    total: MetricRow,
    rates: dict[tuple[str, str], Decimal],
    *,
    category: str = "",
    position: str = "",
    subtotal: bool = False,
) -> BusinessRow:
    site = row.dimensions.get("site", "")
    prices: dict[str, str | None] = {}
    deltas: dict[str, str | None] = {}
    for period, month in PERIODS.items():
        amounts = getattr(row, period)
        fx = rates.get((month, site))
        price = ratio(
            ratio(number(amounts.get("sales_amount")), fx), number(amounts.get("sales_qty"))
        )
        prices[period] = str(price) if price is not None else None
    for period, mode in (("previous", "mom"), ("year_ago", "yoy")):
        for key in ("units", "revenue", "profit", "margin", "return_rate"):
            left, right = number(row.current.get(key)), number(getattr(row, period).get(key))
            deltas[f"{key}_{mode}"] = (
                str(left - right) if left is not None and right is not None else None
            )
    share = ratio(number(row.current.get("revenue")), number(total.current.get("revenue")))
    current = row.current.copy()
    operating_margin = ratio(
        number(current.get("operating_profit")), number(current.get("revenue"))
    )
    current["operating_margin"] = str(operating_margin) if operating_margin is not None else None
    return BusinessRow(
        **{**row.model_dump(include=set(MetricRow.model_fields)), "current": current},
        category=category,
        position=position,
        currency=CURRENCIES.get(site, "EUR" if site in {"DE", "IT", "FR", "ES"} else ""),
        prices=prices,
        revenue_share=str(share) if share is not None else None,
        deltas=deltas,
        subtotal=subtotal,
    )


def site_totals(rows: list[BusinessRow], total: MetricRow) -> list[BusinessRow]:
    return [
        business_row(row, total, {}, category="站点小计", subtotal=True)
        for row in regroup([row for row in rows], ("group", "site"))
    ]


def refund_totals(items: list[BasisAnalysis]) -> dict[str, dict[str, str | None]]:
    output = {}
    by_mode = {(item.comparison, item.basis): item for item in items}
    for item in items:
        if item.basis != "actual":
            continue
        values: dict[str, Decimal | None] = {}
        # 单项费用桥按绝对负担显示，不能直接相加为净利润影响，尤其是成本冲回。
        for field, basis in (
            ("actual", "actual"),
            ("adjusted", "price_adjusted"),
            ("restored", "price_refund_adjusted"),
        ):
            selected = by_mode.get((item.comparison, basis))
            left = number(selected.current.get("margin")) if selected else None
            right = number(selected.base.get("margin")) if selected else None
            values[field] = left - right if left is not None and right is not None else None
        adjusted, restored = values["adjusted"], values["restored"]
        refund = adjusted - restored if adjusted is not None and restored is not None else None
        revenue = number(item.current.get("revenue"))
        values["refund"] = refund
        values["equivalent"] = (
            refund * revenue if refund is not None and revenue is not None else None
        )
        output[item.comparison] = {
            key: str(value) if value is not None else None for key, value in values.items()
        }
    return output


def business_details(
    dataset: ReportDataset, report: FinancialView, items: list[BasisAnalysis], filters: ReportFilter
) -> BusinessDetails:
    rates = exchange_rates(dataset)
    positions = listing_positions(dataset)
    facts = select_facts(dataset, filters)
    categories: dict[tuple[str, str, str], set[str]] = {}
    for fact in facts:
        source = fact.source
        if source.period == "2026-09":
            categories.setdefault((source.group, source.site, source.listing), set()).add(
                source.category3
            )
    rows = [
        business_row(
            row,
            report.summary,
            rates,
            category="、".join(
                sorted(
                    categories.get(
                        (
                            row.dimensions["group"],
                            row.dimensions["site"],
                            row.dimensions["listing"],
                        ),
                        set(),
                    )
                )
            ),
            position=positions.get(
                (row.dimensions["group"], row.dimensions["site"], row.dimensions["listing"]), ""
            ),
        )
        for row in report.breakdowns["listings"]
        if row.record_count > 0
    ]
    profits = [
        row for row in rows if (value := number(row.current["profit"])) is not None and value >= 0
    ]
    losses = [
        row for row in rows if (value := number(row.current["profit"])) is not None and value < 0
    ]
    scope_filters = filters.model_copy(update={"listing": "", "listing_site": "", "search": ""})
    options = breakdown(select_facts(dataset, scope_filters), "listings")
    sites = report.options["site"]
    site_options = ["", "JP", "DE/IT/FR/ES", "UK"] if filters.group == "KAYO-欧日" else ["", *sites]
    scope = " / ".join(
        filter(None, (filters.group, filters.listing_site or filters.site, filters.listing))
    )
    chart_rows = revenue_order(
        [
            row
            for row in regroup(report.breakdowns["category3"], ("category3",))
            if (number(row.current["revenue"]) or Decimal(0)) > 0
        ]
    )[:8]
    chart_total = combine(number(row.current["revenue"]) for row in chart_rows)
    return BusinessDetails(
        scope=scope,
        site_options=site_options,
        listing_options=[
            {"site": row.dimensions["site"], "listing": row.dimensions["listing"]}
            for row in options
            if row.record_count > 0
        ],
        listings=rows,
        site_totals=site_totals(rows, report.summary),
        profit_totals=site_totals(profits, report.summary),
        loss_totals=site_totals(losses, report.summary),
        categories=chart_rows,
        category_total=str(chart_total) if chart_total is not None else None,
        conversion=conversion_changes(items),
        conclusions=business_conclusions(report.summary, items, scope),
        refund_totals=refund_totals(items),
    )
