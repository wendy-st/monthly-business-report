"""正式查询契约：Decimal字符串传输，状态和缺失原因独立返回。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ReportFilter(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    group: str = Field(default="", max_length=100)
    site: str = Field(default="", max_length=20)
    listing: str = Field(default="", max_length=150)
    listing_site: str = Field(default="", max_length=20)
    category1: str = Field(default="", max_length=150)
    category2: str = Field(default="", max_length=150)
    category3: str = Field(default="", max_length=150)
    style: str = Field(default="", max_length=200)
    result: Literal["", "盈利", "亏损"] = ""
    search: str = Field(default="", max_length=150)


class FinancialQuery(ReportFilter):
    view: Literal["full", "overview", "business", "products"] = "full"


class MetricRow(BaseModel):
    key: str
    label: str
    dimensions: dict[str, str] = Field(default_factory=dict)
    current: dict[str, str | None]
    previous: dict[str, str | None]
    year_ago: dict[str, str | None]
    record_count: int
    status: str
    diagnosis: str = ""
    source_rows: list[int] = Field(default_factory=list)
    changes: dict[str, str | None] = Field(default_factory=dict)


class HistoryFilter(ReportFilter):
    years: str = Field(default="2026", pattern=r"^202[0-6](,202[0-6]){0,6}$")


class WaterfallStep(BaseModel):
    label: str
    amount: str | None
    kind: Literal["total", "change"]


class FinancialView(BaseModel):
    report_month: str = "2026-09"
    summary: MetricRow
    series: list[MetricRow]
    breakdowns: dict[str, list[MetricRow]]
    waterfall: dict[str, list[WaterfallStep]]
    options: dict[str, list[str]]
    warnings: list[str]
    snapshot_id: str


class SourceFile(BaseModel):
    file: str
    sha256: str
    size: int


class SourceStatus(BaseModel):
    report_month: str
    identity: str
    files: list[SourceFile]
    counts: dict[str, int]
    mode: str
    formula_freshness: str
