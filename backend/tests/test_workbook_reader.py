from pathlib import Path
from zipfile import ZipFile

from app.services.workbook_reader import read_rows


def test_numeric_text_and_valid_empty_string_cache(tmp_path: Path) -> None:
    path = tmp_path / "source.xlsx"
    with ZipFile(path, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="数据" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
            "</Relationships>",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>金额</t></is></c>'
            '<c r="B1" t="inlineStr"><is><t>款式</t></is></c></row><row r="2">'
            '<c r="A2"><v>123456789012345.123456789</v></c>'
            '<c r="B2" t="str"><f>IF(1,"","X")</f><v/></c></row></sheetData></worksheet>',
        )
    rows = list(read_rows(path, "数据", 1))
    assert rows == [(2, {"金额": "123456789012345.123456789", "款式": ""})]
