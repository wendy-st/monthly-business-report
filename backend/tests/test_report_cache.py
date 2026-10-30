"""结果持久化必须跨进程复用、区分版本并保留缺失金额。"""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from app.schemas.reports import FinancialView, MetricRow, ReportFilter
from app.services.prepared_reports import PreparedReports, financial_projection
from app.services.report_cache import ReportCache


def cache_root(tmp_path: Path) -> Path:
    (tmp_path / "report-2026-09.json").write_text('{"identity":"source-one"}', encoding="utf-8")
    return tmp_path


def test_concurrent_results_generate_once_and_reopen_without_calculation(tmp_path: Path) -> None:
    root = cache_root(tmp_path)
    cache = ReportCache(root, "rules-one")
    calls = []

    def build() -> object:
        calls.append(1)
        return {"amount": "0.1234567890123456789", "missing": None, "zero": "0"}

    def request(_: int) -> Path:
        return cache.result("costs", {"group": "A"}, build)

    with ThreadPoolExecutor(max_workers=4) as pool:
        paths = list(pool.map(request, range(8)))
    assert len(calls) == 1
    assert len(set(paths)) == 1
    reopened = ReportCache(root, "rules-one")
    path = reopened.result("costs", {"group": "A"}, lambda: pytest.fail("不应重新核算"))
    assert path == paths[0]
    assert json.loads(path.read_bytes()) == build()
    assert ReportCache(root, "rules-two").directory != cache.directory
    (root / "report-2026-09.json").write_text('{"identity":"source-two"}', encoding="utf-8")
    assert ReportCache(root, "rules-one").directory != cache.directory


def test_failed_generation_never_publishes_partial_result(tmp_path: Path) -> None:
    cache = ReportCache(cache_root(tmp_path), "rules-one")

    def fail() -> object:
        raise ValueError("合成核算失败")

    with pytest.raises(ValueError, match="合成核算失败"):
        cache.result("financial", {}, fail)
    assert not list(cache.directory.glob("*.json"))
    path = cache.result("financial", {}, lambda: {"amount": None})
    assert json.loads(path.read_bytes()) == {"amount": None}
    assert not list(cache.directory.glob("*.pending"))


def test_compact_financial_result_keeps_values_and_lineage_without_loading_sources(
    tmp_path: Path,
) -> None:
    row = MetricRow(
        key="A",
        label="A",
        dimensions={},
        current={"revenue": "12.3456789", "profit": None, "margin": None, "purchase": "0"},
        previous={"profit": "-1"},
        year_ago={"revenue": "0"},
        record_count=1,
        status="DATA_MISSING",
        source_rows=[9],
    )
    full = FinancialView(
        summary=row,
        series=[row],
        breakdowns={"groups": [row], "styles": [row]},
        waterfall={},
        options={},
        warnings=[],
        snapshot_id="source-one",
    )
    compact = financial_projection(full)
    assert "styles" not in compact.breakdowns
    assert "styles" in full.breakdowns
    assert compact.breakdowns["groups"][0].current == {
        "revenue": "12.3456789",
        "profit": None,
        "margin": None,
    }
    assert compact.breakdowns["groups"][0].source_rows == [9]
    assert compact.summary == full.summary
    reports = PreparedReports(cache_root(tmp_path), "rules-one")
    reports.cache.result("financial", ReportFilter().model_dump(), lambda: full)
    assert (
        FinancialView.model_validate_json(reports.path("financial", compact=True).read_bytes())
        == compact
    )
    assert "dataset" not in reports.__dict__
