"""历史看板统一时间轴：自然年与4月至次年3月财年，半年及同期间截点。"""

from collections import defaultdict
from dataclasses import dataclass

from app.schemas.reports import MetricRow, PeriodScope, YearBasis
from app.services.history_data import frozen_summary, history_rows
from app.services.source_import import SourceRecord


@dataclass(frozen=True)
class HistoryCalendar:
    basis: YearBasis
    scope: PeriodScope
    cutoff: str
    first_period: str

    @property
    def start_month(self) -> int:
        return 4 if self.basis == "fiscal" else 1

    @property
    def bounds(self) -> tuple[int, int]:
        return {"full": (1, 12), "h1": (1, 6), "h2": (7, 12)}[self.scope]

    def year(self, period: str) -> str:
        return str(int(period[:4]) - (int(period[5:]) < self.start_month))

    def index(self, period: str) -> int:
        return (int(period[5:]) - self.start_month) % 12 + 1

    def period(self, year: str, index: int) -> str:
        month = self.start_month + index - 1
        return f"{int(year) + (month - 1) // 12:04}-{(month - 1) % 12 + 1:02}"

    def end_index(self, year: str) -> int:
        """按全表报告截止月截断，不能把单个LISTING缺行误当作期间终点。"""
        if year < self.year(self.cutoff):
            return self.bounds[1]
        if year > self.year(self.cutoff):
            return 0
        return min(self.bounds[1], self.index(self.cutoff))

    def select(
        self, records: list[SourceRecord], year: str, end_index: int | None = None
    ) -> list[SourceRecord]:
        start, _ = self.bounds
        end = self.end_index(year) if end_index is None else end_index
        return [
            row
            for row in records
            if self.year(row.period) == year
            and start <= self.index(row.period) <= end
            and row.period <= self.cutoff
        ]

    def year_name(self, year: str) -> str:
        return f"{year}/{str(int(year) + 1)[-2:]}财年" if self.basis == "fiscal" else f"{year}年"

    def year_label(self, year: str) -> str:
        start, end = self.bounds
        suffix = (
            "YTD"
            if start <= self.end_index(year) < end
            else "*"
            if self.period(year, start) < self.first_period <= self.period(year, end)
            else ""
        )
        return self.year_name(year) + suffix

    def label(self, year: str, end_index: int | None = None) -> str:
        start, nominal_end = self.bounds
        end = self.end_index(year) if end_index is None else end_index
        future = end < start
        end = nominal_end if future else end
        half = {"full": "", "h1": "上半年", "h2": "下半年"}[self.scope]
        if self.basis == "calendar" and self.scope == "full" and not future:
            return f"{year}年1-{end}月" if end < 12 else f"{year}年"
        span = f"{self.period(year, start)}至{self.period(year, end)}"
        state = "，暂无数据" if future else "累计" if end < nominal_end else ""
        return f"{self.year_name(year)}{half}（{span}{state}）"

    def previous_label(self, year: str) -> str:
        if self.end_index(year) < self.bounds[0]:
            return "本期尚未开始，暂无同期比较"
        return self.label(str(int(year) - 1), self.end_index(year))

    @property
    def month_order(self) -> list[int]:
        start, end = self.bounds
        return [int(self.period("2000", index)[5:]) for index in range(start, end + 1)]

    def selected(self, records: list[SourceRecord], years: list[str]) -> list[SourceRecord]:
        return [row for year in sorted(set(years)) for row in self.select(records, year)]

    def monthly(self, records: list[SourceRecord]) -> list[MetricRow]:
        rows = history_rows(records, "monthly")
        for row in rows:
            row.dimensions["analysis_year"] = self.year(row.dimensions["month"])
        return rows

    def quarterly(self, records: list[SourceRecord]) -> list[MetricRow]:
        pools: dict[str, list[SourceRecord]] = defaultdict(list)
        for source in records:
            key = f"{self.year(source.period)}-Q{(self.index(source.period) - 1) // 3 + 1}"
            pools[key].append(source)
        result = []
        for key, sources in sorted(pools.items()):
            row = frozen_summary(sources, key, {"quarter": key})
            year, quarter = key.split("-")
            row.label = self.year_name(year) + quarter if self.basis == "fiscal" else key
            result.append(row)
        return result
