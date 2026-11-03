"""将指定源表只读导入本地不可变快照；不覆盖已登记月份。"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path

from app.services.financial_model import FIELDS, group_name
from app.services.report_period import BASELINE_MONTH, ReportPeriod
from app.services.source_contract import SheetSpec as SheetSpec
from app.services.source_contract import sheet_specs as contract_specs
from app.services.source_contract import source_plan
from app.services.source_preflight import inspect_file
from app.services.workbook_reader import RawRow, period, read_rows


@dataclass
class SourceRecord:
    period: str
    group: str
    site: str
    listing: str
    category1: str
    category2: str
    category3: str
    style: str
    msku: str
    sku: str
    file: str
    sheet: str
    row: int
    raw: RawRow


def record(file: str, sheet: str, index: int, raw: RawRow) -> SourceRecord:
    monthly = period(raw.get("年份"), raw.get("月份")) if raw.get("年份") else ""
    if not monthly and raw.get("年月"):
        monthly = period(raw["年月"])
    return SourceRecord(
        monthly,
        group_name(raw.get("小组")),
        (raw.get("站点") or "").strip().upper(),
        (raw.get("LISTING") or raw.get("Listing") or "").strip(),
        raw.get("一级品类") or raw.get("大类") or "",
        raw.get("二级品类") or raw.get("二级大类") or "",
        raw.get("三级品类") or raw.get("品牌-品类") or "",
        raw.get("产品款式") or "",
        (raw.get("MSKU") or "").strip(),
        raw.get("SKU") or raw.get("sku") or raw.get("积加SKU") or "",
        file,
        sheet,
        index,
        raw,
    )


def sheet_specs(name: str, month: str = BASELINE_MONTH) -> list[SheetSpec]:
    return contract_specs(name, month)


def file_hash(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def required_headers(family: str, month: str, sheet: str = "") -> set[str]:
    if family == "inventory":
        keys = {"年月", "站点", "LISTING"}
        if "FBA" in sheet:
            return keys | {
                "期末库存(含转运中)数量",
                "期末库存(含转运中)采购成本",
                "期末库存(含转运中)总成本",
                "FBA在途数量",
                "FBA在途采购成本",
                "FBA在途总成本",
                "订单发货数量",
                "买家退货数量",
                "订单发货采购成本",
                "买家退货采购成本",
                "订单发货总成本",
                "买家退货总成本",
                "期初含转运中数量",
                "期初含转运中采购成本",
                "期初含转运中总成本",
            }
        return keys | {"总库存", "总货值", "总采购成本", "总头程成本"}
    return {
        "shipping": {"小组", "站点", "LISTING", "总发货天数", "运营保底下单天数"},
        "forecast_mapping": {
            "负责人",
            "站点",
            "Listing",
            "对应经营月报的小组字段",
            "对应经营月报的小组字段LISTING",
        },
        "style_mapping": {"站点", "LISTING", "SKU", "MSKU"},
        "operating": {"年份", "月份", "小组", "站点", "LISTING", "MSKU", *FIELDS.values()},
        "products": {"小组", "站点", "LISTING", "产品定位"},
        "rates": {"年份", "月份", "US", "CA", "UK", "JP", "DE/FR/IT/ES"},
        "current_inventory": {
            "年月",
            "站点",
            "LISTING",
            "所属仓",
            "总库存",
            "总采购成本",
            "总头程成本",
        },
        "history": {"年份", "月份", "站点", "LISTING", "销售金额", "产品净利润"},
        "forecast": {
            "站点",
            "Listing",
            "MSKU",
            "积加SKU",
            "负责人",
            *[f"{n}月" for n in range(1, 13)],
        },
    }.get(family, set())


def validate_records(family: str, rows: list[dict[str, object]], month: str) -> None:
    if family not in {"operating", "current_inventory", "rates", "history", "forecast"}:
        return
    if not rows:
        raise ValueError(f"{family}没有有效记录")
    if family in {"operating", "current_inventory", "rates", "history"}:
        expected = set(ReportPeriod(month).months) if family in {"operating", "rates"} else {month}
        available = {str(row["period"]) for row in rows}
        if expected - available:
            raise ValueError(f"{family}缺少期间：{sorted(expected - available)}")


def import_sources(source_dir: Path, destination: Path, month: str = BASELINE_MONTH) -> Path:
    plan = source_plan(source_dir, month)
    paths = [source_dir / name for name in plan]
    files = [
        {"file": path.name, "sha256": file_hash(path), "size": path.stat().st_size}
        for path in paths
    ]
    identity = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
    if month != BASELINE_MONTH:
        identity = hashlib.sha256(f"{month}:{identity}".encode()).hexdigest()
    pointer = destination / f"report-{month}.json"
    if pointer.exists():
        existing = json.loads(pointer.read_text(encoding="utf-8"))
        if existing["identity"] != identity:
            raise ValueError(f"{month}已登记不同源版本，停止导入以避免覆盖历史调整")
        return destination / "snapshots" / identity
    snapshot = destination / "snapshots" / identity
    snapshot.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    for path in paths:
        checked = inspect_file(path, [spec.sheet for spec in plan[path.name]])
        if checked["missing_sheets"]:
            raise ValueError(f"{path.name}缺少工作表：{checked['missing_sheets']}")
        for spec in plan[path.name]:
            if spec.family == "shipping":
                list(read_rows(path, spec.sheet, spec.header, required_headers("shipping", month)))
                shutil.copy2(path, snapshot / "shipping.xlsx")
                continue
            target = snapshot / f"{spec.family}-{path.stem}-{spec.header}-{spec.sheet[:8]}.json"
            if target.exists():
                counts[spec.family] = counts.get(spec.family, 0) + len(
                    json.loads(target.read_text(encoding="utf-8"))
                )
                continue
            records = [
                asdict(record(path.name, spec.sheet, index, raw))
                for index, raw in read_rows(
                    path, spec.sheet, spec.header, required_headers(spec.family, month, spec.sheet)
                )
            ]
            validate_records(spec.family, records, month)
            temporary = target.with_suffix(".pending")
            temporary.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
            temporary.replace(target)
            counts[spec.family] = counts.get(spec.family, 0) + len(records)
            print(f"读取 {spec.family}：{len(records)}行", flush=True)
    for item, path in zip(files, paths, strict=True):
        if item["sha256"] != file_hash(path):
            raise ValueError("导入期间源文件发生变化，未发布快照")
    manifest = {
        "report_month": month,
        "identity": identity,
        "files": files,
        "counts": counts,
        "mode": "direct_workbook_cached_values",
        "formula_freshness": "NOT_RECALCULATED",
    }
    (snapshot / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    pending = destination / f"report-{month}.pending"
    pending.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    pending.replace(pointer)
    return snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description="只读接入指定月份配套源表")
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument(
        "--destination", type=Path, default=Path(__file__).resolve().parents[3] / "runtime" / "data"
    )
    parser.add_argument("--month", default=BASELINE_MONTH)
    args = parser.parse_args()
    # 生成成功后才登记月份，命令行和网页使用同一发布流程。
    from app.services.import_batches import batch_directory, create_batch, publish_sources

    root = args.destination.resolve()
    batch = create_batch(root, args.month)
    work = batch_directory(root, batch.id) / "work"
    print(publish_sources(args.source_dir.resolve(), root, args.month, work))


if __name__ == "__main__":
    main()
