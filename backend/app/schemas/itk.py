"""ITK汇总表、筛选与展示契约；金额在服务端保留Decimal。"""

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class Metrics(BaseModel):
    sales: Decimal | None = None
    units: Decimal | None = None
    returns: Decimal | None = None
    rate: Decimal | None = None
    asp: Decimal | None = None
    count: int = 0
    sales_count: int = 0
    units_count: int = 0
    returns_count: int = 0
    negative_count: int = 0
    fallback_count: int = 0


class Row(Metrics):
    month: str
    site: str
    currency: str
    category: str
    audience: str
    kind: str
    brand: str
    status: str = "完整"


class Scope(BaseModel):
    start: str = ""
    end: str = ""
    site: str = "US"
    category: str = ""
    audience: str = ""
    brand: str = ""


class ComparisonBase(Scope):
    target: Literal["SEEKWAY", "RIVMOUNT", "SIMARI", "RIVBOS"] = "SEEKWAY"
    kind: str = ""


class ComparisonScope(ComparisonBase):
    peers: list[str] | None = None


class ComparisonQuery(ComparisonBase):
    peers: str | None = None


class OverviewExportScope(Scope):
    search: str = ""
    sort: str = "month"
    descending: bool = True
    details: bool = False


class Options(BaseModel):
    months: list[str]
    sites: list[str]
    categories: list[str]
    audiences: list[str]
    start: str
    end: str
    row_count: int
    source_count: int
    negative_count: int
    reference_metadata: bool


class NamedMetrics(Metrics):
    name: str


class OverviewView(BaseModel):
    scope: Scope
    currency: str
    brands: list[str]
    totals: Metrics
    trend: list[NamedMetrics]
    ranking: list[NamedMetrics]
    composition: list[NamedMetrics]
    rows: list[Row]


class CategoryOption(BaseModel):
    category: str
    audience: str
    kind: str


class BrandSummary(Metrics):
    brand: str
    months: int
    units_rank: int | None = None
    sales_rank: int | None = None
    units_total: int = 0
    sales_total: int = 0
    units_peak: NamedMetrics | None = None
    sales_peak: NamedMetrics | None = None


class BrandSeries(BaseModel):
    brand: str
    points: list[NamedMetrics | None]


class Benchmark(BaseModel):
    brand: str
    month: str
    value: Decimal
    target: Decimal | None
    gap: Decimal | None


class ComparisonView(BaseModel):
    scope: ComparisonScope
    currency: str
    sites: list[str]
    categories: list[CategoryOption]
    months: list[str]
    pool: list[BrandSummary]
    selected: list[str]
    summaries: list[BrandSummary]
    series: list[BrandSeries]
    units_peak: Benchmark | None
    sales_peak: Benchmark | None
    lowest: BrandSummary | None
    rate_gap: Decimal | None
