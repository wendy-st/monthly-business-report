import json
from pathlib import Path
from unittest.mock import Mock, call, patch

from app.schemas.reports import ReportFilter
from app.services.prepare_reports import prepare
from app.services.prepared_reports import PreparedReports
from app.services.report_cache import ReportCache


def test_prepare_inventory_sites_before_ready_and_reuse_on_restart(tmp_path: Path) -> None:
    (tmp_path / "report-2026-09.json").write_text('{"identity":"synthetic"}', encoding="utf-8")
    reports = Mock(spec=PreparedReports)
    reports.cache = ReportCache(tmp_path, "test-rules")
    groups = {
        "HCM": ["US", "CA"],
        "KAYO-北美": ["US", "CA", "MX"],
        "KAYO-欧日": ["JP", "UK", "DE", "IT", "FR", "ES"],
    }
    choices = tmp_path / "options.json"
    choices.write_text(json.dumps({"group": list(groups)}), encoding="utf-8")
    paths = {}
    for group, sites in groups.items():
        target = tmp_path / f"{group}.json"
        target.write_text(json.dumps({"options": {"site": sites}}), encoding="utf-8")
        paths[group] = target

    def result(
        resource: str, filters: ReportFilter | None = None, *, compact: bool = False
    ) -> Path:
        if resource == "inventory" and filters is not None and filters.group:
            return paths[filters.group]
        return choices

    reports.path.side_effect = result
    with patch("app.services.prepare_reports.PreparedReports", return_value=reports):
        ready = prepare(tmp_path)
        assert ready.exists()
        for group, sites in groups.items():
            for site in sites:
                assert (
                    call("inventory", ReportFilter(group=group, site=site))
                    in reports.path.call_args_list
                )
        before = reports.path.call_count
        assert prepare(tmp_path) == ready
        assert reports.path.call_count == before  # 已准备完成后启动不重复核算。
