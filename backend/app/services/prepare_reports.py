"""导入后或首次启动时准备常用结果；已完成的版本直接复用。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.schemas.reports import HistoryFilter, ReportFilter
from app.services.prepared_reports import PreparedReports
from app.services.report_cache import data_root, encode_result
from app.services.report_period import BASELINE_MONTH


def prepare(root: Path, month: str = BASELINE_MONTH) -> Path:
    reports = PreparedReports(root, month=month)
    ready = reports.cache.directory / "ready.json"
    if ready.exists():
        print("报告结果已准备，直接复用。", flush=True)
        return ready
    reports.path("sources")
    options = json.loads(reports.path("options").read_text(encoding="utf-8"))
    groups = ["", *options["group"]]
    for group in groups:
        filters = ReportFilter(group=group)
        for resource in ("financial", "products", "costs", "inventory", "listing"):
            reports.path(resource, filters)
            print(f"已准备 {group or '公司整体'} / {resource}", flush=True)
        reports.path("financial", filters, compact=True)
        if group:
            reports.path("business", filters)
            inventory = json.loads(reports.path("inventory", filters).read_bytes())
            # 站点筛选在用户点击前准备，避免首次请求初始化全量库存及周转事实。
            for site in inventory["options"]["site"]:
                reports.path("inventory", ReportFilter(group=group, site=site))
                print(f"已准备 {group} / {site} / inventory", flush=True)
        reports.path("history", HistoryFilter(group=group))
    reports.path("overview")
    reports.cache.publish(
        ready, encode_result({"identity": reports.cache.identity, "groups": groups})
    )
    return ready


def main() -> None:
    parser = argparse.ArgumentParser(description="预生成月度报告常用结果，不重新导入Excel")
    parser.add_argument("--data-dir", type=Path, default=data_root())
    parser.add_argument("--month")
    args = parser.parse_args()
    root = args.data_dir.resolve()
    months = (
        [args.month]
        if args.month
        else sorted(p.stem.removeprefix("report-") for p in root.glob("report-*.json"))
    )
    if not months:
        parser.error("尚未导入任何月份")
    for month in months:
        print(prepare(root, month))


if __name__ == "__main__":
    main()
