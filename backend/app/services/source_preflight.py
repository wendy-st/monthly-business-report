"""只读结构预检；不重算公式，不将缓存或结构通过解释为业务验收。"""

from __future__ import annotations

import argparse
import hashlib
import json
import xml.etree.ElementTree as ElementTree
from collections.abc import Iterable
from pathlib import Path
from typing import TypedDict
from zipfile import ZipFile

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
NS = {"m": MAIN_NS}

REQUIRED_SHEETS = {
    "经营报告数据汇报表 - 2026年9月.xlsx": [
        "月度经营底表",
        "产品基础信息表",
        "汇率信息",
        "库存数据",
    ],
    "2026年-库存周转率 - 副本.xlsx": [
        "数据源-2026年-FBA仓-进销存",
        "数据源-2026-本地仓&海外仓-新",
    ],
    "2025年-库存周转率 - 副本.xlsx": [
        "数据源-2025年-FBA仓-进销存",
        "数据源-2025-本地仓&海外仓",
        "FBA-2024.12",
    ],
    "全小组_库存款式补充映射表_2026-09.xlsx": ["自动匹配核对", "待补充映射"],
    "MSKU月销量预估表-2026-09-21.xlsx": ["2026预估销量", "字段映射"],
    "近6年LISTING盈收汇总（2026年-2020年4月-AMAZON）.xlsx": ["LISTING数据源总表"],
}


class SheetCheck(TypedDict):
    name: str
    rows_with_cached_values: int
    formula_cells: int
    missing_formula_caches: int
    cached_error_cells: int


class FileCheck(TypedDict):
    file: str
    sha256: str
    size: int
    required: bool
    missing_sheets: list[str]
    external_links: int
    sheets: list[SheetCheck]


class PreflightResult(TypedDict):
    report_month: str
    structure_complete: bool
    business_validated: bool
    formula_freshness: str
    files: list[FileCheck]
    missing_files: list[str]


def sheet_locations(archive: ZipFile) -> dict[str, str]:
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    relationships = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}
    result = {}
    for sheet in workbook.findall("m:sheets/m:sheet", NS):
        target = targets[sheet.attrib[REL_ID]]
        result[sheet.attrib["name"]] = (
            target.lstrip("/") if target.startswith("/") else f"xl/{target}"
        )
    return result


def inspect_sheet(archive: ZipFile, name: str, location: str) -> SheetCheck:
    result: SheetCheck = {
        "name": name,
        "rows_with_cached_values": 0,
        "formula_cells": 0,
        "missing_formula_caches": 0,
        "cached_error_cells": 0,
    }
    with archive.open(location) as stream:
        for _, row in ElementTree.iterparse(stream, events=["end"]):
            if row.tag != f"{{{MAIN_NS}}}row":
                continue
            cells = row.findall("m:c", NS)
            if any(cell.find("m:v", NS) is not None for cell in cells):
                result["rows_with_cached_values"] += 1
            for cell in cells:
                if cell.attrib.get("t") == "e":
                    result["cached_error_cells"] += 1
                if cell.find("m:f", NS) is not None:
                    result["formula_cells"] += 1
                    cached = cell.find("m:v", NS)
                    if cached is None or cached.text is None:
                        result["missing_formula_caches"] += 1
            row.clear()
    return result


def inspect_file(path: Path, required_sheets: Iterable[str]) -> FileCheck:
    expected = list(required_sheets)
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    with ZipFile(path) as archive:
        locations = sheet_locations(archive)
        return {
            "file": path.name,
            "sha256": digest,
            "size": path.stat().st_size,
            "required": bool(expected),
            "missing_sheets": sorted(set(expected) - locations.keys()),
            "external_links": sum(
                name.startswith("xl/externalLinks/externalLink") and name.endswith(".xml")
                for name in archive.namelist()
            ),
            "sheets": [
                inspect_sheet(archive, name, locations[name])
                for name in expected
                if name in locations
            ],
        }


def inspect_sources(source_dir: Path) -> PreflightResult:
    paths = sorted(source_dir.glob("*.xlsx"))
    missing = sorted(set(REQUIRED_SHEETS) - {path.name for path in paths})
    files = [inspect_file(path, REQUIRED_SHEETS.get(path.name, [])) for path in paths]
    return {
        "report_month": "2026-09",
        "structure_complete": not missing and not any(row["missing_sheets"] for row in files),
        "business_validated": False,
        "formula_freshness": "NOT_VERIFIED",
        "files": files,
        "missing_files": missing,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="只读检查2026-09基准输入，不进行业务重算")
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = args.source_dir.resolve()
    output = args.output.resolve()
    if output.suffix != ".json" or output.parent == source:
        parser.error("输出必须是运行目录中的JSON文件，不能写入源数据根目录")
    result = inspect_sources(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "structure_complete": result["structure_complete"],
                "business_validated": False,
                "files": len(result["files"]),
                "output": str(output),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
