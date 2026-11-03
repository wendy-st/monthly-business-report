"""只读解析 XLSX 缓存，直接保留 XML 十进制文本，避免先转浮点。"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from pathlib import Path
from zipfile import ZipFile

from app.services.source_preflight import MAIN_NS, NS, sheet_locations

RawRow = dict[str, str | None]


def normalize_header(value: str) -> str:
    return re.sub(r"\s+", "", value)


def column_number(address: str) -> int:
    number = 0
    for char in re.sub(r"\d", "", address):
        number = number * 26 + ord(char) - ord("A") + 1
    return number


def shared_strings(archive: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    result = []
    with archive.open("xl/sharedStrings.xml") as stream:
        for _, element in ET.iterparse(stream, events=["end"]):
            if element.tag == f"{{{MAIN_NS}}}si":
                result.append("".join(element.itertext()))
                element.clear()
    return result


def cell_value(cell: ET.Element, strings: list[str]) -> str | None:
    kind = cell.attrib.get("t")
    if kind == "e":
        raise ValueError(f"公式缓存错误：{cell.attrib['r']}")
    value = cell.find("m:v", NS)
    if kind == "inlineStr":
        return "".join(cell.findtext("m:is/m:t", default="", namespaces=NS))
    if kind == "str" and value is not None and value.text is None:
        return ""
    if value is None or value.text is None:
        if cell.find("m:f", NS) is not None:
            raise ValueError(f"公式缺少缓存：{cell.attrib['r']}")
        return None
    return strings[int(value.text)] if kind == "s" else value.text


def read_rows(
    path: Path, sheet: str, header_row: int, required: set[str] | None = None
) -> Iterator[tuple[int, RawRow]]:
    """保留交易原行，不按业务键去重；重复表头仅取首次列名。"""
    with ZipFile(path) as archive:
        strings = shared_strings(archive)
        location = sheet_locations(archive)[sheet]
        headers: dict[int, str] = {}
        with archive.open(location) as stream:
            for _, row in ET.iterparse(stream, events=["end"]):
                if row.tag != f"{{{MAIN_NS}}}row":
                    continue
                index = int(row.attrib["r"])
                cells = {
                    column_number(cell.attrib["r"]): cell_value(cell, strings)
                    for cell in row.findall("m:c", NS)
                }
                if index == header_row:
                    headers = {
                        column: normalize_header(value) for column, value in cells.items() if value
                    }
                    missing = (required or set()) - set(headers.values())
                    if missing:
                        raise ValueError(f"{path.name}/{sheet}缺少字段：{sorted(missing)}")
                elif index > header_row and any(value is not None for value in cells.values()):
                    record: RawRow = {}
                    for column, name in headers.items():
                        if name not in record:
                            record[name] = cells.get(column)
                    yield index, record
                row.clear()


def period(year: str | None, month: str | None = None) -> str:
    pieces = re.findall(r"\d+", f"{year or ''}.{month or ''}")
    if len(pieces) < 2:
        raise ValueError("源行缺少有效年月")
    annual, monthly = int(pieces[0]), int(pieces[1])
    if annual < 100:
        annual += 2000
    if not 1 <= monthly <= 12:
        raise ValueError("月份超出1至12")
    return f"{annual:04}-{monthly:02}"
