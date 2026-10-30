"""将指定源表只读导入本地不可变快照；不覆盖已登记月份。"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from app.services.financial_model import group_name
from app.services.source_preflight import REQUIRED_SHEETS
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


@dataclass(frozen=True)
class SheetSpec:
    family: str
    sheet: str
    header: int


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


def sheet_specs(name: str) -> list[SheetSpec]:
    if name.startswith("经营报告"):
        return [
            SheetSpec("operating", "月度经营底表", 2),
            SheetSpec("products", "产品基础信息表", 1),
            SheetSpec("rates", "汇率信息", 2),
            SheetSpec("current_inventory", "库存数据", 1),
        ]
    if name.startswith("近6年"):
        return [SheetSpec("history", "LISTING数据源总表", 1)]
    if name.startswith("MSKU"):
        return [
            SheetSpec("forecast", "2026预估销量", 1),
            SheetSpec("forecast_mapping", "字段映射", 3),
        ]
    if name.startswith("全小组"):
        return [
            SheetSpec("style_mapping", "自动匹配核对", 5),
            SheetSpec("style_mapping", "待补充映射", 5),
        ]
    return [
        SheetSpec("inventory", sheet, 1 if "本地仓" in sheet else 2)
        for sheet in REQUIRED_SHEETS[name]
    ]


def file_hash(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def import_sources(source_dir: Path, destination: Path) -> Path:
    paths = sorted(path for path in source_dir.glob("*.xlsx") if not path.name.startswith("~$"))
    files = [
        {"file": path.name, "sha256": file_hash(path), "size": path.stat().st_size}
        for path in paths
    ]
    missing = set(REQUIRED_SHEETS) - {path.name for path in paths}
    if missing:
        raise ValueError(f"缺少必需来源：{sorted(missing)}")
    identity = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
    pointer = destination / "report-2026-09.json"
    if pointer.exists():
        existing = json.loads(pointer.read_text(encoding="utf-8"))
        if existing["identity"] != identity:
            raise ValueError("9月已登记不同源版本，停止导入以避免覆盖历史调整")
        return destination / "snapshots" / identity
    snapshot = destination / "snapshots" / identity
    snapshot.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    for path in paths:
        if path.name not in REQUIRED_SHEETS and not path.name.startswith("全小组"):
            continue
        for spec in sheet_specs(path.name):
            target = snapshot / f"{spec.family}-{path.stem}-{spec.header}-{spec.sheet[:8]}.json"
            if target.exists():
                counts[spec.family] = counts.get(spec.family, 0) + len(
                    json.loads(target.read_text(encoding="utf-8"))
                )
                continue
            records = [
                asdict(record(path.name, spec.sheet, index, raw))
                for index, raw in read_rows(path, spec.sheet, spec.header)
            ]
            temporary = target.with_suffix(".pending")
            temporary.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
            temporary.replace(target)
            counts[spec.family] = counts.get(spec.family, 0) + len(records)
            print(f"读取 {spec.family}：{len(records)}行", flush=True)
    for item, path in zip(files, paths, strict=True):
        if item["sha256"] != file_hash(path):
            raise ValueError("导入期间源文件发生变化，未发布快照")
    manifest = {
        "report_month": "2026-09",
        "identity": identity,
        "files": files,
        "counts": counts,
        "mode": "direct_workbook_cached_values",
        "formula_freshness": "NOT_RECALCULATED",
    }
    (snapshot / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    pending = destination / "report-2026-09.pending"
    pending.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    pending.replace(pointer)
    return snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description="只读接入2026年9月源表")
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument(
        "--destination", type=Path, default=Path(__file__).resolve().parents[3] / "runtime" / "data"
    )
    args = parser.parse_args()
    print(import_sources(args.source_dir.resolve(), args.destination.resolve()))
    # 只在导入命令完成后生成派生结果，避免快照读取模块的循环依赖。
    from app.services.prepare_reports import prepare

    prepare(args.destination.resolve())


if __name__ == "__main__":
    main()
