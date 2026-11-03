from decimal import Decimal
from unittest.mock import Mock, patch

import pytest

from app.schemas.reports import ReportFilter
from app.services.inventory_seasons import season_bounds, season_catalogue, season_context
from app.services.report_dataset import ReportDataset
from app.services.source_import import record


@pytest.mark.parametrize(
    ("month", "phase"),
    [
        ("2026-04", "淡季"),
        ("2026-06", "淡季"),
        ("2026-07", "备货期"),
        ("2026-08", "备货期"),
        ("2026-09", "备货期"),
        ("2026-10", "季初"),
        ("2026-11", "旺季"),
        ("2026-12", "旺季"),
        ("2027-01", "旺季"),
        ("2027-02", "旺季"),
        ("2027-03", "季末"),
        ("2027-04", "淡季"),
    ],
)
def test_winter_season_and_three_preparation_months(month: str, phase: str) -> None:
    result = season_bounds((1, 2, 3, 10, 11, 12), month)
    assert result[0] == phase
    if "2026-07" <= month <= "2027-03":
        assert result[1:] == ("2026-10", "2027-03")


def test_summer_start_and_end_do_not_follow_peak() -> None:
    assert season_bounds((4, 5, 6, 7, 8, 9), "2026-04")[0] == "季初"
    assert season_bounds((4, 5, 6, 7, 8, 9), "2026-09")[0] == "季末"
    assert season_bounds((4, 5, 6, 7, 8, 9), "2026-08")[0] == "旺季"


def test_catalogue_conflict_does_not_pick_first_row() -> None:
    dataset = Mock(spec=ReportDataset)
    dataset.records.return_value = [
        record(
            "source.xlsx",
            "产品基础信息表",
            n,
            {
                "小组": "Ash",
                "站点": "CA",
                "LISTING": "X",
                "旺季月份": months,
            },
        )
        for n, months in enumerate(("10,11,12,1,2,3", "4,5,6,7,8,9"), 2)
    ]
    assert (
        season_context(dataset, ReportFilter(group="Ash", site="CA", listing="X"))[0]
        == "季节资料待确认"
    )
    season_catalogue.cache_clear()


def test_peak_includes_next_year_and_requires_complete_season() -> None:
    dataset = Mock(spec=ReportDataset)
    dataset.manifest = {"report_month": "2026-09"}
    dataset.records.return_value = [
        record(
            "source.xlsx",
            "产品基础信息表",
            2,
            {
                "小组": "Ash",
                "站点": "CA",
                "LISTING": "X",
                "旺季月份": "10,11,12,1,2,3",
            },
        )
    ]
    forecasts = {
        month: Decimal(1)
        for month in (
            "2026-10",
            "2026-11",
            "2026-12",
            "2027-01",
            "2027-02",
            "2027-03",
        )
    }
    forecasts["2027-01"] = Decimal(10)
    with patch("app.services.inventory_seasons.forecast_amounts", return_value=(forecasts, 0)):
        result = season_context(dataset, ReportFilter(group="Ash", site="CA", listing="X"))
        assert result == ("备货期", "2026-10", "2027-03", "2027-01")
        del forecasts["2027-02"]
        assert season_context(dataset, ReportFilter(group="Ash"))[3] == ""
    season_catalogue.cache_clear()
