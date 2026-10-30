"""业务组当月页派生契约；保留完整三期指标与独立筛选范围。"""

from pydantic import BaseModel, Field

from app.schemas.overview import ConclusionItem
from app.schemas.reports import FinancialView, MetricRow


class BusinessRow(MetricRow):
    category: str = ""
    position: str = ""
    currency: str = ""
    prices: dict[str, str | None] = Field(default_factory=dict)
    revenue_share: str | None = None
    deltas: dict[str, str | None] = Field(default_factory=dict)
    subtotal: bool = False


class BusinessDetails(BaseModel):
    scope: str
    site_options: list[str]
    listing_options: list[dict[str, str]]
    listings: list[BusinessRow]
    site_totals: list[BusinessRow]
    profit_totals: list[BusinessRow]
    loss_totals: list[BusinessRow]
    categories: list[MetricRow]
    category_total: str | None
    conversion: dict[str, dict[str, dict[str, str | None]]]
    conclusions: dict[str, list[ConclusionItem]]
    refund_totals: dict[str, dict[str, str | None]]


class BusinessView(FinancialView):
    business: BusinessDetails
