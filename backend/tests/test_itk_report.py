"""用合成汇总数据验证权重、并列名次、标杆范围和导出空值。"""

import csv
import io
from decimal import Decimal

import pytest

from app.schemas.itk import ComparisonScope, Metrics, Options, Row, Scope
from app.services import itk_data, itk_report
from app.services.itk_export import comparison_csv, detail_rows, encode, overview_csv


def row(brand: str, month: str, units: str, sales: str, returns: str = "0", **extra: object) -> Row:
    return Row.model_validate(
        {
            "brand": brand,
            "month": month,
            "units": units,
            "sales": sales,
            "returns": returns,
            "category": "水鞋",
            "audience": "成人",
            "kind": "五趾水鞋",
            "site": "US",
            "currency": "USD",
            "count": 1,
            "units_count": 1,
            "sales_count": 1,
            "returns_count": 1,
            **extra,
        }
    )


@pytest.fixture
def sample(monkeypatch: pytest.MonkeyPatch) -> list[Row]:
    rows = [
        row("SEEKWAY", "2026-01", "10", "100.01", "3"),
        row("SEEKWAY", "2026-03", "30", "300.02", "1"),
        row("A", "2026-01", "20", "200", "1"),
        row("A", "2026-02", "20", "200", "3"),
        row("B", "2026-01", "100", "1000", "90"),
        row("C", "2026-02", "40", "400", "-4", negative_count=1),
    ]
    options = Options(
        months=["2026-01", "2026-02", "2026-03"],
        sites=["US"],
        categories=["水鞋"],
        audiences=["成人"],
        start="2026-01",
        end="2026-03",
        row_count=len(rows),
        source_count=len(rows),
        negative_count=1,
        reference_metadata=False,
    )
    monkeypatch.setattr(itk_data, "dataset", lambda: (rows, options))
    monkeypatch.setattr(itk_report, "dataset", lambda: (rows, options))
    return rows


def scope(peers: list[str] | None = None) -> ComparisonScope:
    return ComparisonScope(peers=peers)


def test_weighted_rates_decimal_and_nonpositive_denominators() -> None:
    a = row("X", "2026-01", "10", "100.01", "3")
    b = row("X", "2026-02", "30", "300.02", "1")
    result = itk_data.aggregate([a, b])
    assert result.sales == Decimal("400.03")
    assert result.rate == Decimal("0.1")
    assert result.asp == Decimal("400.03") / 40
    assert itk_data.aggregate([row("X", "2026-01", "-1", "-10", "1")]).rate is None
    assert itk_data.aggregate([Metrics()]).units is None
    assert itk_data.aggregate([row("X", "2026-01", "0", "0")]).units == 0


def test_ranks_all_samples_selected_lowest_and_monthly_gaps(sample: list[Row]) -> None:
    result = itk_report.comparison(scope(["A"]))
    assert result.selected == ["SEEKWAY", "A"]
    assert result.summaries[0].sales == Decimal("400.03")
    assert result.summaries[0].units_rank == 2
    assert result.summaries[1].units_rank == 2
    assert result.summaries[0].units_total == 4
    assert result.units_peak is not None and result.units_peak.brand == "B"
    assert result.units_peak.target == 10
    assert result.units_peak.gap == -90
    assert result.lowest is not None and result.lowest.brand == "A"
    assert result.rate_gap == 0
    assert result.series[0].points[1] is None
    only = itk_report.comparison(scope([]))
    assert only.lowest is None and only.rate_gap is None
    assert only.units_peak == result.units_peak
    assert only.summaries[0].units_rank == 2
    negative = itk_report.comparison(scope(["C"]))
    assert negative.lowest is not None and negative.lowest.rate == Decimal("-0.1")


def test_default_peers_and_competition_ranks(sample: list[Row]) -> None:
    result = itk_report.comparison(scope())
    assert result.selected == ["SEEKWAY", "B", "A", "C"]
    assert {s.brand: s.units_rank for s in result.pool} == {"B": 1, "A": 2, "C": 2, "SEEKWAY": 2}
    sample.append(row("D", "2026-02", "1", "1"))
    result = itk_report.comparison(scope())
    assert next(s.units_rank for s in result.pool if s.brand == "D") == 5


def test_overview_filter_search_and_export_are_separate(sample: list[Row]) -> None:
    result = itk_report.overview(Scope())
    assert result.totals.units == 220
    assert result.totals.returns == 94
    filtered = detail_rows(result.rows, "SEEKWAY", "month", True)
    assert len(filtered) == 2
    assert result.totals.units == 220
    assert filtered[0].month == "2026-03"
    with pytest.raises(ValueError):
        detail_rows(result.rows, "", "unapproved", True)
    csv_rows = list(csv.reader(io.StringIO(overview_csv(filtered).decode("utf-8-sig"))))
    assert len(csv_rows[0]) == 19 and len(csv_rows) == 3
    assert csv_rows[1][7] == "300.02"


def test_missing_months_and_negative_numbers_export(sample: list[Row]) -> None:
    result = itk_report.comparison(scope(["C"]))
    exported = comparison_csv(result)
    assert exported.startswith(b"\xef\xbb\xbf") and b"\r\n" in exported
    rows = list(csv.reader(io.StringIO(exported.decode("utf-8-sig"))))
    assert len(rows[0]) == 22 and len(rows) == 7
    missing = rows[3]
    assert missing[5:8] == ["2026-02", "SEEKWAY", ""]
    assert missing[12] == "缺失月份，未补零"
    assert rows[4][10] == "-4"
    assert rows[4][20] == "-0.1"
    text = encode(["测试"], [["=SUM(A1)", '带逗号,与"引号"', Decimal("-2"), None]]).decode(
        "utf-8-sig"
    )
    assert "'=SUM(A1)" in text and '"-2"' in text and '""引号""' in text


def test_dates_and_invalid_site_validation(sample: list[Row]) -> None:
    with pytest.raises(ValueError):
        itk_report.overview(Scope(start="2026-03", end="2026-01"))
    with pytest.raises(ValueError):
        itk_report.overview(Scope(site="UNKNOWN"))
    with pytest.raises(ValueError):
        itk_report.comparison(ComparisonScope(start="2026-99"))


def test_csv_parser_preserves_zero_null_and_quotes(
    tmp_path: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    from pathlib import Path

    path = Path(str(tmp_path)) / "sample.csv"
    headers = [
        "年月",
        "站点",
        "品类",
        "人群",
        "细分类型",
        "品牌",
        "销售额",
        "销量",
        "退货量",
        *itk_data.COUNTS.values(),
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(headers)
        writer.writerow(
            ["2026-01", "US", "水鞋", "成人", "五趾水鞋", 'A,"B"', "", "0", "0", 1, 0, 1, 1, 0, 0]
        )
    monkeypatch.setattr(itk_data, "SOURCE", path)
    itk_data._load.cache_clear()
    loaded, _ = itk_data._load((0, 0))
    assert loaded[0].brand == 'A,"B"'
    assert loaded[0].sales is None and loaded[0].units == 0
    assert loaded[0].rate is None and "销售额缺失 1 条" in loaded[0].status
    itk_data._load.cache_clear()
