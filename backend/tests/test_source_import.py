"""用真实XLSX结构验证多月份导入，不读取或改写业务源文件。"""

import json
from pathlib import Path
from unittest.mock import patch
from xml.sax.saxutils import escape
from zipfile import ZipFile

import pytest

from app.schemas.reports import ReportFilter
from app.services.financial_report import financial_view
from app.services.import_batches import publish_sources
from app.services.report_dataset import open_dataset
from app.services.report_period import ReportPeriod
from app.services.source_contract import sheet_specs, source_plan
from app.services.source_import import required_headers


def workbook(path: Path, sheets: list[tuple[str, int, list[dict[str, str]]]]) -> None:
    def cells(values: list[str], row: int) -> str:
        output = []
        for index, value in enumerate(values, 1):
            column, number = "", index
            while number:
                number, remainder = divmod(number - 1, 26)
                column = chr(65 + remainder) + column
            output.append(f'<c r="{column}{row}" t="inlineStr"><is><t>{escape(value)}</t></is></c>')
        return "".join(output)

    namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    with ZipFile(path, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            f'<workbook xmlns="{namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
            + "".join(
                f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>'
                for i, (name, _, _) in enumerate(sheets, 1)
            )
            + "</sheets></workbook>",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            "<Relationships>"
            + "".join(
                f'<Relationship Id="rId{i}" Target="worksheets/sheet{i}.xml"/>'
                for i in range(1, len(sheets) + 1)
            )
            + "</Relationships>",
        )
        for i, (_, header, rows) in enumerate(sheets, 1):
            columns = sorted(rows[0])
            xml = f'<row r="{header}">{cells(columns, header)}</row>'
            for n, row in enumerate(rows, header + 1):
                xml += f'<row r="{n}">{cells([row.get(key, "") for key in columns], n)}</row>'
            archive.writestr(
                f"xl/worksheets/sheet{i}.xml",
                f'<worksheet xmlns="{namespace}"><sheetData>{xml}</sheetData></worksheet>',
            )


def source_set(folder: Path, month: str = "2026-10") -> Path:
    folder.mkdir(parents=True)
    year = month[:4]
    names = [
        f"经营报告-{month}.xlsx",
        f"{year}年-库存周转率.xlsx",
        f"{int(year) - 1}年-库存周转率.xlsx",
        f"全小组_库存款式补充映射表_{month}.xlsx",
        f"MSKU预估-{month}.xlsx",
        "近6年LISTING.xlsx",
        "库存发货天数表.xlsx",
    ]
    for name in names:
        sheets = []
        for spec in sheet_specs(name, month):
            periods = (
                ReportPeriod(month).months if spec.family in {"operating", "rates"} else (month,)
            )
            rows = []
            for period in periods:
                raw = dict.fromkeys(required_headers(spec.family, month, spec.sheet), "0")
                raw.update(
                    {
                        "年份": period[:4],
                        "月份": period[5:],
                        "年月": period,
                        "小组": "LZF",
                        "站点": "US",
                        "LISTING": "TEST",
                        "Listing": "TEST",
                        "MSKU": "M1",
                        "SKU": "S1",
                        "积加SKU": "S1",
                        "产品定位": "维护",
                        "一级品类": "测试品类",
                        "二级品类": "测试",
                        "三级品类": "测试",
                        "产品款式": "测试款",
                        "所属仓": "本地仓",
                    }
                )
                if spec.family == "operating":
                    raw.update(
                        {
                            "销售金额": "1000" if period == month else "500",
                            "销售数量": "10",
                            "销售成本": "100",
                        }
                    )
                if spec.family == "rates":
                    raw.update(dict.fromkeys(("US", "CA", "UK", "JP", "DE/FR/IT/ES"), "5"))
                if spec.family == "current_inventory":
                    raw.update({"总库存": "100", "总采购成本": "1000", "总头程成本": "100"})
                if spec.family == "history":
                    raw.update({"销售金额": "1000", "产品净利润": "200"})
                if spec.family == "forecast":
                    raw.update({"11月": "10", "12月": "10", "负责人": "测试"})
                if spec.family == "shipping":
                    raw.update({"总发货天数": "30", "运营保底下单天数": "60"})
                rows.append(raw)
            sheets.append((spec.sheet, spec.header, rows))
        workbook(folder / name, sheets)
    return folder


def test_october_real_workbooks_generate_before_month_publication(tmp_path: Path) -> None:
    source, root = source_set(tmp_path / "sources"), tmp_path / "data"
    before = {p.name: p.read_bytes() for p in source.iterdir()}
    september = root / "report-2026-09.json"
    root.mkdir()
    september.write_text('{"identity":"original-september"}', encoding="utf-8")
    detail = publish_sources(source, root, "2026-10", tmp_path / "work")
    assert "生成完成" in detail
    report = financial_view(open_dataset(root, "2026-10"), ReportFilter())
    assert report.report_month == "2026-10"
    assert report.summary.current["revenue"] == "1000"
    assert report.summary.previous["revenue"] == "500"
    assert report.summary.year_ago["revenue"] == "500"
    assert json.loads(september.read_text())["identity"] == "original-september"
    assert before == {p.name: p.read_bytes() for p in source.iterdir()}
    pointer = (root / "report-2026-10.json").read_bytes()
    with patch("app.services.import_batches.prepare", side_effect=AssertionError("不应重复生成")):
        assert "复用" in publish_sources(source, root, "2026-10", tmp_path / "reuse")
    with (source / "经营报告-2026-10.xlsx").open("ab") as stream:
        stream.write(b"changed-version")
    with pytest.raises(ValueError, match="不同源版本"):
        publish_sources(source, root, "2026-10", tmp_path / "conflict")
    assert (root / "report-2026-10.json").read_bytes() == pointer


def test_generation_failure_and_wrong_period_do_not_publish(tmp_path: Path) -> None:
    source, root = source_set(tmp_path / "sources"), tmp_path / "data"
    with patch("app.services.import_batches.prepare", side_effect=ValueError("核算失败")):
        with pytest.raises(ValueError, match="核算失败"):
            publish_sources(source, root, "2026-10", tmp_path / "work")
    assert not (root / "report-2026-10.json").exists()
    # 9月表不能通过改文件名充当10月数据。
    wrong = source_set(tmp_path / "wrong", "2026-09")
    (wrong / "全小组_库存款式补充映射表_2026-09.xlsx").rename(
        wrong / "全小组_库存款式补充映射表_2026-10.xlsx"
    )
    with pytest.raises(ValueError, match="缺少期间"):
        publish_sources(wrong, root, "2026-10", tmp_path / "wrong-work")
    assert not (root / "report-2026-10.json").exists()


def test_missing_duplicate_and_historical_mapping_sources(tmp_path: Path) -> None:
    source = source_set(tmp_path / "sources")
    (source / "全小组_库存款式补充映射表_2026-09.xlsx").write_bytes(
        (source / "全小组_库存款式补充映射表_2026-10.xlsx").read_bytes()
    )
    assert len(source_plan(source, "2026-10")) == 8
    (source / "经营报告-重复.xlsx").write_bytes(b"duplicate")
    with pytest.raises(ValueError, match="同类来源重复"):
        source_plan(source, "2026-10")
