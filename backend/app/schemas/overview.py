"""公司总览专用输出；不改变业务组和产品页契约。"""

from pydantic import BaseModel, Field

from app.schemas.reports import FinancialView, MetricRow


class OverviewRow(MetricRow):
    revenue_share: str | None = None
    profit_share: str | None = None
    bar_ratio: str | None = None
    deltas: dict[str, str | None] = Field(default_factory=dict)


class ConclusionItem(BaseModel):
    label: str
    detail: str


class OverviewDetails(BaseModel):
    conversion: dict[str, dict[str, dict[str, str | None]]]
    conclusions: dict[str, list[ConclusionItem]] = Field(default_factory=dict)
    groups: list[OverviewRow] = Field(default_factory=list)
    sites: list[OverviewRow] = Field(default_factory=list)
    total: OverviewRow | None = None
    categories: list[OverviewRow] = Field(default_factory=list)
    sales_top10: list[OverviewRow] = Field(default_factory=list)
    loss_top10: list[OverviewRow] = Field(default_factory=list)
    shops: list[OverviewRow] = Field(default_factory=list)
    shop_totals: dict[str, OverviewRow] = Field(default_factory=dict)


class OverviewView(FinancialView):
    overview: OverviewDetails
