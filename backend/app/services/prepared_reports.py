"""复用现有核算器生成结果，按页面选择传输字段。"""

from __future__ import annotations

from functools import cached_property
from pathlib import Path

from pydantic import TypeAdapter

from app.schemas.business import BusinessView
from app.schemas.overview import OverviewView
from app.schemas.products import ProductRefundQuery
from app.schemas.reports import FinancialView, HistoryFilter, MetricRow, ReportFilter
from app.services.business_report import business_details
from app.services.cost_analysis import BasisAnalysis, analyses
from app.services.financial_report import filter_options, financial_view
from app.services.historical_report import history_view
from app.services.inventory_report import build_turnover, inventory_view
from app.services.inventory_sources import InventoryFact
from app.services.listing_report import listing_view
from app.services.overview_report import overview_details
from app.services.product_refunds import refund_analysis
from app.services.product_report import product_view
from app.services.report_cache import ReportCache
from app.services.report_dataset import ReportDataset, open_dataset
from app.services.report_period import BASELINE_MONTH
from app.services.shipping_standards import shipping_identity, shipping_source

OVERVIEW_GRAINS = {"groups", "sites", "categories", "category3", "listings", "shops"}
DISPLAY_AMOUNTS = {"units", "revenue", "profit", "margin"}


def display_row(row: MetricRow) -> MetricRow:
    return row.model_copy(
        update={
            name: {
                key: value for key, value in getattr(row, name).items() if key in DISPLAY_AMOUNTS
            }
            for name in ("current", "previous", "year_ago")
        }
    )


def financial_projection(report: FinancialView) -> FinancialView:
    # 仅裁剪传输内容，金额、排序、来源行和三期状态均沿用原核算结果。
    return report.model_copy(
        update={
            "breakdowns": {
                key: [display_row(row) for row in rows]
                for key, rows in report.breakdowns.items()
                if key in OVERVIEW_GRAINS
            }
        }
    )


class PreparedReports:
    def __init__(
        self, root: Path, version: str | None = None, *, month: str = BASELINE_MONTH
    ) -> None:
        self.cache = ReportCache(root, version, month=month)

    @cached_property
    def dataset(self) -> ReportDataset:
        return open_dataset(self.cache.root, self.cache.month)

    @cached_property
    def turnover(self) -> list[InventoryFact]:
        return build_turnover(self.dataset)

    def path(
        self, resource: str, filters: ReportFilter | None = None, *, compact: bool = False
    ) -> Path:
        filters = filters or ReportFilter()
        parameters = filters.model_dump()
        if resource in {"inventory", "listing"}:
            parameters["shipping_source"] = shipping_identity(
                shipping_source(
                    self.cache.root / "snapshots" / self.cache.identity, self.cache.month
                )
            )
        if resource == "financial" and compact:
            return self.cache.result(
                "financial-display",
                parameters,
                lambda: financial_projection(
                    FinancialView.model_validate_json(self.path("financial", filters).read_bytes())
                ),
            )
        return self.cache.result(resource, parameters, lambda: self.build(resource, filters))

    def build(self, resource: str, filters: ReportFilter) -> object:
        if resource == "product-refunds" and isinstance(filters, ProductRefundQuery):
            scope = ReportFilter(**filters.model_dump(exclude={"min_sales"}))
            financial = FinancialView.model_validate_json(
                self.path("financial", scope).read_bytes()
            )
            return refund_analysis(financial, filters.min_sales)
        if resource == "business":
            financial = FinancialView.model_validate_json(
                self.path("financial", filters).read_bytes()
            )
            costs = TypeAdapter(list[BasisAnalysis]).validate_json(
                self.path("costs", filters).read_bytes()
            )
            return BusinessView(
                **financial_projection(financial).model_dump(),
                business=business_details(self.dataset, financial, costs, filters),
            )
        if resource == "overview":
            financial = FinancialView.model_validate_json(
                self.path("financial", filters).read_bytes()
            )
            costs = TypeAdapter(list[BasisAnalysis]).validate_json(
                self.path("costs", filters).read_bytes()
            )
            return OverviewView(
                **financial_projection(financial).model_dump(),
                overview=overview_details(financial, costs),
            )
        if resource == "products":
            financial = FinancialView.model_validate_json(
                self.path("financial", filters).read_bytes()
            )
            return product_view(self.dataset, financial, filters)
        if resource == "sources":
            return self.cache.manifest
        if resource == "options":
            return filter_options(self.dataset, filters)
        if resource == "financial":
            return financial_view(self.dataset, filters)
        if resource == "costs":
            return analyses(self.dataset, filters)
        if resource == "inventory":
            return inventory_view(self.dataset, filters, self.turnover)
        if resource == "listing":
            return listing_view(self.dataset, filters, self.turnover)
        if resource == "history" and isinstance(filters, HistoryFilter):
            return history_view(
                self.dataset, filters, [year for year in filters.years.split(",") if year]
            )
        raise ValueError("未知报告结果类型")
