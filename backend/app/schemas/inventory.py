"""库存总览、小组核算与下钻明细契约。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class FutureRow(BaseModel):
    month: str
    scope: str
    scenario: str
    demand: str | None
    remaining: str | None
    support_days: str | None
    calendar_days: int


class SeasonalRisk(BaseModel):
    phase: str
    peak_month: str
    season_start: str = ""
    season_end: str
    health: str
    score: int
    level: str
    reasons: list[str]
    season_end_remaining_rate: str | None
    window_end_remaining_rate: str | None


class InventoryRow(BaseModel):
    key: str
    label: str
    dimensions: dict[str, str]
    values: dict[str, str | None]
    source_rows: list[int]


class InventoryKpi(BaseModel):
    label: str
    unit: str
    current: str | None
    previous: str | None
    year_ago: str | None
    mom: str | None
    yoy: str | None


class InventoryRisk(BaseModel):
    key: str
    label: str
    risk: SeasonalRisk
    dimensions: dict[str, str] = Field(default_factory=dict)
    values: dict[str, str | None] = Field(default_factory=dict)
    exhaustion: str = ""
    conclusions: list[str] = Field(default_factory=list)
    core_conclusion: str = ""
    skus: list[InventoryRow] = Field(default_factory=list)


class InventoryView(BaseModel):
    summary: InventoryRow
    breakdowns: dict[str, list[InventoryRow]]
    turnover: list[InventoryRow]
    future: list[FutureRow]
    warnings: list[str]
    source_note: str
    seasonal: list[InventoryRisk]
    seasonal_styles: list[InventoryRisk] = Field(default_factory=list)
    seasonal_group: InventoryRisk | None = None
    kpis: list[InventoryKpi] = Field(default_factory=list)
    conclusions: list[str] = Field(default_factory=list)
    options: dict[str, list[str]] = Field(default_factory=dict)
