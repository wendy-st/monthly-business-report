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

from app.services.report_period import BASELINE_MONTH
from app.services.source_contract import source_plan

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
NS = {"m": MAIN_NS}


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


def inspect_sources(source_dir: Path, month: str = BASELINE_MONTH) -> PreflightResult:
    try:
        plan = source_plan(source_dir, month)
        missing = []
    except ValueError as error:
        plan = {}
        missing = [str(error)]
    files = [
        inspect_file(source_dir / name, [spec.sheet for spec in specs])
        for name, specs in plan.items()
    ]
    return {
        "report_month": month,
        "structure_complete": not missing and not any(row["missing_sheets"] for row in files),
        "business_validated": False,
        "formula_freshness": "NOT_VERIFIED",
        "files": files,
        "missing_files": missing,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="只读检查指定月份配套输入，不进行业务重算")
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--month", default=BASELINE_MONTH)
    args = parser.parse_args()
    source = args.source_dir.resolve()
    output = args.output.resolve()
    if output.suffix != ".json" or output.parent == source:
        parser.error("输出必须是运行目录中的JSON文件，不能写入源数据根目录")
    result = inspect_sources(source, args.month)
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
