"""读取独立快照并构建三期责任索引，与旧项目运行路径解耦。"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from app.services.financial_model import Amounts, financials, group_name
from app.services.source_import import SourceRecord


@dataclass
class OperatingFact:
    source: SourceRecord
    amounts: Amounts
    assignment: str


class ReportDataset:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        self.cache: dict[str, list[SourceRecord]] = {}
        operating = self.records("operating")
        self.relations: dict[tuple[str, str, str], set[str]] = defaultdict(set)
        self.periods = sorted({item.period for item in operating})
        for item in operating:
            if item.site and item.msku and item.group:
                self.relations[item.period, item.site, item.msku].add(item.group)
        self.operating = [self.prepare(item) for item in operating]
        self.align_historical_styles()

    def align_historical_styles(self) -> None:
        current: dict[tuple[str, ...], set[str]] = defaultdict(set)

        def key(source: SourceRecord) -> tuple[str, ...]:
            return (
                source.group,
                source.site,
                source.listing,
                source.msku,
                source.category1,
                source.category2,
                source.category3,
            )

        for fact in self.operating:
            if fact.source.period == "2026-09" and fact.source.msku:
                current[key(fact.source)].add(fact.source.style)
        for fact in self.operating:
            styles = current.get(key(fact.source), set())
            if fact.source.period < "2026-09" and fact.source.msku and len(styles) == 1:
                fact.source.style = next(iter(styles))

    def records(self, family: str) -> list[SourceRecord]:
        if family not in self.cache:
            self.cache[family] = [
                SourceRecord(**item)
                for path in sorted(self.directory.glob(f"{family}-*.json"))
                for item in json.loads(path.read_text(encoding="utf-8"))
            ]
        return self.cache[family]

    def resolve(self, monthly: str, site: str, msku: str) -> tuple[str, str]:
        if not site or not msku:
            return "", "MISSING_SITE_OR_MSKU"
        for candidate in reversed([item for item in self.periods if item <= monthly]):
            groups = self.relations.get((candidate, site, msku), set())
            if len(groups) > 1:
                return "", "RESPONSIBILITY_CONFLICT"
            if groups:
                return next(
                    iter(groups)
                ), "ASSIGNED" if candidate == monthly else "HISTORICAL_BACKFILL"
        return "", "NOT_FOUND"

    def prepare(self, source: SourceRecord) -> OperatingFact:
        assigned, status = self.resolve(source.period, source.site, source.msku)
        candidates = self.relations.get((source.period, source.site, source.msku), set())
        if len(candidates) > 1:
            source.group = "未分配"
        elif source.group:
            status = "SOURCE_PERIOD_GROUP"
        else:
            source.group = assigned or "未分配"
        return OperatingFact(source, financials(source.raw), status)

    def external_group(self, source: SourceRecord) -> tuple[str, str]:
        assigned, status = self.resolve(source.period or "2026-09", source.site, source.msku)
        if assigned:
            return assigned, status
        if status == "RESPONSIBILITY_CONFLICT":
            return "未分配", status
        return group_name(source.group) or "未分配", "SOURCE_GROUP_FALLBACK"


def open_dataset(root: Path) -> ReportDataset:
    pointer = json.loads((root / "report-2026-09.json").read_text(encoding="utf-8"))
    return ReportDataset(root / "snapshots" / pointer["identity"])
