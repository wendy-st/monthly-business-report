"""确保公式缓存风险不会被解释成业务验证通过。"""

from pathlib import Path
from zipfile import ZipFile

from app.services.source_preflight import MAIN_NS, inspect_file, inspect_sources


def test_missing_caches_and_excel_errors_remain_visible(tmp_path: Path) -> None:
    source = tmp_path / "合成.xlsx"
    with ZipFile(source, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            f'''<workbook xmlns="{MAIN_NS}"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets><sheet name="输入" sheetId="1" r:id="rId1"/></sheets></workbook>''',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<Relationships>
          <Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>""",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            f'''<worksheet xmlns="{MAIN_NS}">
          <sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c>
          <c r="B1"><f>1+2</f><v/></c><c r="C1" t="e"><v>#REF!</v></c>
          </row></sheetData></worksheet>''',
        )
        archive.writestr("xl/externalLinks/externalLink1.xml", "<externalLink/>")
    result = inspect_file(source, ["输入", "缺少表"])
    assert result["missing_sheets"] == ["缺少表"]
    assert result["external_links"] == 1
    sheet = result["sheets"][0]
    assert sheet["formula_cells"] == 2
    assert sheet["missing_formula_caches"] == 1
    assert sheet["cached_error_cells"] == 1


def test_incomplete_source_set_cannot_pass_structure_or_business(tmp_path: Path) -> None:
    result = inspect_sources(tmp_path)
    assert result["missing_files"]
    assert not result["structure_complete"]
    assert not result["business_validated"]
    assert result["formula_freshness"] == "NOT_VERIFIED"
