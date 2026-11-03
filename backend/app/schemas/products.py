"""品类页的诊断依据、实际成本归因和三期单位成本契约。"""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.reports import FinancialView, ReportFilter


class ProductRefundQuery(ReportFilter):
    min_sales: int = Field(default=100, ge=1)


class ProductRefundView(BaseModel):
    min_sales: int
    total_styles: int
    low_sales_count: int
    low_sales_share: str | None
    low_sales_qty_share: str | None
    missing_sales_count: int
    statuses: dict[str, Literal["eligible", "low_sales", "missing_sales"]]
    eligible_keys: list[str]
    ranking_keys: list[str]
    abnormal_keys: list[str]


class ProductStyleContext(BaseModel):
    diagnosis: str = "待核验"
    basis: str = "待核验"
    benchmark: str | None = None
    local_price: str | None = None
    currency: str = ""


class ProductCostComparison(BaseModel):
    values: dict[str, str | None]
    conclusion: list[str]


class ProductAnalysis(BaseModel):
    style_count: int
    contexts: dict[str, ProductStyleContext]
    comparisons: dict[str, ProductCostComparison]
    trends: dict[str, dict[str, str | None]]
    rates: dict[str, dict[str, dict[str, str | None]]]
    scope_available: bool = True
    scope_note: str = ""


class ProductView(FinancialView):
    product: ProductAnalysis
