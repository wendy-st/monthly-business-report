"""年度原稿口径：资格过滤、冻结利润、同期间比较和独立拆解范围。"""

from decimal import Decimal

from app.schemas.reports import HistoryFilter, ReportFilter
from app.services.financial_model import FIELDS, number
from app.services.historical_report import history_view
from app.services.history_data import HISTORICAL_NAMES
from app.services.report_dataset import ReportDataset
from app.services.source_import import SourceRecord, record


def source(month: str, listing: str = "A", **values: str | None) -> SourceRecord:
    raw: dict[str, str | None] = dict.fromkeys(FIELDS.values(), "0")
    raw.update(dict.fromkeys(HISTORICAL_NAMES.values(), "0"))
    raw.update(
        {
            "年份": month[:4],
            "月份": month[5:],
            "小组": "LZF",
            "站点": "US",
            "LISTING": listing,
            "销售数量": "10",
            "退货数量": "2",
            "销售金额": "100",
            "退货金额": "-20",
            "产品净利润": "30",
            "主营业务利润": "40",
            "产品营业利润": "35",
        }
    )
    raw.update(values)
    return record("近6年合成测试.xlsx", "LISTING数据源总表", 2, raw)


def dataset(rows: list[SourceRecord], positions: list[SourceRecord] | None = None) -> ReportDataset:
    data = ReportDataset.__new__(ReportDataset)
    data.manifest = {"report_month": "2026-09"}
    data.cache = {"history": rows, "products": positions or []}
    return data


def test_frozen_cumulative_profit_and_same_period_comparison() -> None:
    data = dataset(
        [
            source("2020-04"),
            source("2025-01", 产品净利润="-20"),
            source("2025-09", 产品净利润="-10"),
            source("2025-10", 产品净利润="900"),
            source("2026-01"),
            source("2026-09"),
            source("2026-10", 产品净利润="9999"),
        ]
    )
    report = history_view(data, ReportFilter(group="LZF"), ["2025", "2026"])
    assert report.summary.current["units"] == "16"
    assert report.summary.current["revenue"] == "160"
    assert report.summary.current["profit"] == "60"
    assert report.summary.year_ago["profit"] == "-30"
    assert report.summary.changes["profit_yoy"] == "3"
    assert report.period_label == "2026年1-9月"
    assert report.period_start == "2020-04" and report.period_end == "2026-09"
    assert report.annual[1].current["profit"] == "870"
    assert report.annual[-1].current["profit"] == "60"
    assert all(row.dimensions["month"] != "2026-10" for row in report.monthly)


def test_trend_listing_does_not_narrow_listing_breakdown_or_quadrant() -> None:
    data = dataset(
        [
            source("2026-01"),
            source("2026-09"),
            source("2026-09", "B", 销售金额="200", 产品净利润="-20"),
            source("2026-09", "A", 站点="CA", 销售金额="500"),
        ]
    )
    report = history_view(data, ReportFilter(group="LZF", site="US", listing="A"), ["2026"])
    assert report.summary.current["revenue"] == "160"
    assert {row.dimensions["listing"] for row in report.listings} == {"A", "B"}
    assert {row.dimensions["site"] for row in report.listings} == {"US"}
    assert report.listings[0].dimensions["listing"] == "B"
    assert report.quadrant["revenue"] == "180"
    assert report.insights["weak"] == report.listings[0]
    assert len(report.best_months) == 1


def test_all_regions_exclude_inactive_and_closed_using_site_listing_eligibility() -> None:
    data = dataset(
        [
            source("2025-01", "old"),
            source("2026-09", "old", 销售金额="0"),
            source("2025-01", "shared"),
            source("2026-09", "shared", 小组="HCM"),
            source("2026-09", "closed"),
            source("2026-09"),
        ],
        [source("2026-09", "closed", 产品定位="已停运")],
    )
    report = history_view(data, ReportFilter(group="LZF"), ["2026"])
    assert {row.dimensions["listing"] for row in report.best_months} == {"shared", "A"}
    assert len(report.excluded) == 2
    assert {row.dimensions["listing"] for row in report.listings} == {"A"}
    assert report.annual[0].current["revenue"] == "80"


def test_missing_is_not_zero_and_empty_selection_remains_available() -> None:
    data = dataset([source("2025-01"), source("2026-01", 产品净利润=None)])
    report = history_view(data, ReportFilter(), ["2026"])
    assert report.summary.current["profit"] is None
    assert report.summary.changes["profit_yoy"] is None
    assert report.best_months[0].current["current_profit"] is None
    assert report.best_months[0].current["profit_difference"] is None
    empty = history_view(data, ReportFilter(listing="不存在"), ["2026"])
    assert empty.summary.current["revenue"] is None
    assert empty.annual == [] and empty.best_months == []
    assert empty.options["listing"] == ["A"]


def test_cost_rate_uses_signed_sum_before_absolute_value() -> None:
    data = dataset(
        [
            source("2026-09", **{"运费补贴&FBA配送费": "-10"}),
            source("2026-09", "B", **{"运费补贴&FBA配送费": "2"}),
        ]
    )
    report = history_view(data, ReportFilter(), ["2026"])
    assert number(report.cost_trends[0].current["delivery_rate"]) == Decimal("0.05")
    assert report.cost_trends[0].current["profit"] == "60"
    assert report.summary.changes["revenue_yoy"] is None


def test_position_conflict_stays_visible_and_only_inbound_blank_is_zero() -> None:
    data = dataset(
        [source("2026-09", 入库配置费=None)],
        [
            source("2026-09", 产品定位="维护"),
            source("2026-09", 产品定位="已停运"),
        ],
    )
    report = history_view(data, ReportFilter(), ["2026"])
    assert report.excluded == []
    assert report.best_months[0].dimensions["position"] == "定位待确认：已停运、维护"
    assert report.cost_trends[0].current["storage_rate"] == "0"
    data.cache["history"][0].raw["基础仓储费"] = None
    assert (
        history_view(data, ReportFilter(), ["2026"]).cost_trends[0].current["storage_rate"] is None
    )


def test_original_confirmed_position_overrides_apply_only_to_september() -> None:
    data = dataset(
        [
            source("2026-09", "RG802", 小组="HCM"),
            source("2026-01", "RG802", 小组="KAYO-北美"),
        ],
        [
            source("2026-09", "RG802", 小组="HCM", 产品定位="维护"),
            source("2026-09", "RG802", 小组="HCM", 产品定位="废弃"),
        ],
    )
    report = history_view(data, ReportFilter(), ["2026"])
    assert report.best_months == []
    assert len(report.excluded) == 2
    assert {row.dimensions["position"] for row in report.excluded} == {"已停运"}
    data.manifest["report_month"] = "2026-10"
    later = history_view(data, ReportFilter(), ["2026"])
    assert len(later.best_months) == 2 and later.excluded == []


def test_fiscal_march_april_boundary_and_same_month_yoy() -> None:
    data = dataset(
        [
            source("2025-03", 产品净利润="900"),
            source("2025-04", 产品净利润="10"),
            source("2025-09", 产品净利润="20"),
            source("2026-03", 产品净利润="700"),
            source("2026-04", 产品净利润="40"),
            source("2026-09", 产品净利润="50"),
        ]
    )
    view = history_view(data, HistoryFilter(year_basis="fiscal"), ["2025", "2026"])
    assert view.summary.current["profit"] == "90"
    assert view.summary.year_ago["profit"] == "30"
    assert view.summary.changes["profit_yoy"] == "2"
    assert view.period_label == "2026/27财年（2026-04至2026-09累计）"
    assert view.previous_period_label == "2025/26财年（2025-04至2025-09累计）"
    assert [(row.key, row.current["profit"]) for row in view.annual] == [
        ("2024", "900"),
        ("2025", "730"),
        ("2026", "90"),
    ]
    assert next(row for row in view.quarterly if row.key == "2025-Q4").current["profit"] == "700"
    assert next(row for row in view.quarterly if row.key == "2026-Q1").current["profit"] == "40"
    assert view.month_order == [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
    assert view.year_labels["2026"] == "2026/27财年YTD"
    assert (
        next(row for row in view.cost_trends if row.key == "2026-03").dimensions["analysis_year"]
        == "2025"
    )


def test_fiscal_halves_reconcile_and_second_half_includes_next_year() -> None:
    data = dataset(
        [
            source(month, 产品净利润=str(index))
            for index, month in enumerate(
                ["2025-04", "2025-09", "2025-10", "2025-12", "2026-01", "2026-03", "2026-04"], 1
            )
        ]
    )
    views = {
        scope: history_view(data, HistoryFilter(year_basis="fiscal", period_scope=scope), ["2025"])
        for scope in ("full", "h1", "h2")
    }
    assert views["full"].summary.current["profit"] == "21"
    assert views["h1"].summary.current["profit"] == "3"
    assert views["h2"].summary.current["profit"] == "18"
    assert [row.key for row in views["h2"].monthly] == ["2025-10", "2025-12", "2026-01", "2026-03"]
    assert [row.key for row in views["h2"].quarterly] == ["2025-Q3", "2025-Q4"]
    assert views["h2"].month_order == [10, 11, 12, 1, 2, 3]
    assert views["h1"].month_order == [4, 5, 6, 7, 8, 9]
    assert views["h2"].listings[0].current["profit"] == "18"
    assert views["h2"].insights["profit"] == views["h2"].listings[0]


def test_future_half_has_no_zero_filled_metrics_and_peaks_stay_independent() -> None:
    data = dataset([source("2025-10"), source("2026-01"), source("2026-04"), source("2026-09")])
    view = history_view(data, HistoryFilter(year_basis="fiscal", period_scope="h2"), ["2026"])
    assert view.summary.status == "NO_RECORD"
    assert view.summary.current["profit"] is None and view.summary.year_ago["profit"] is None
    assert view.summary.changes["profit_yoy"] is None
    assert view.monthly == view.quarterly == view.cost_trends == view.listings == []
    assert view.annual[-1].status == "NO_RECORD"
    assert view.annual[-1].current["profit"] is None
    assert "暂无数据" in view.period_label
    assert view.previous_period_label == "本期尚未开始，暂无同期比较"
    assert view.best_months == history_view(data, ReportFilter(), ["2026"]).best_months


def test_calendar_half_year_yoy_and_annual_table_use_equal_month_ranges() -> None:
    data = dataset(
        [
            source("2025-07", 产品净利润="10"),
            source("2025-09", 产品净利润="20"),
            source("2025-10", 产品净利润="900"),
            source("2026-01", 产品净利润="300"),
            source("2026-07", 产品净利润="40"),
            source("2026-09", 产品净利润="50"),
        ]
    )
    view = history_view(data, HistoryFilter(period_scope="h2"), ["2026"])
    assert view.summary.current["profit"] == "90"
    assert view.summary.year_ago["profit"] == "30"
    assert view.summary.changes["profit_yoy"] == "2"
    assert view.annual[-1].changes["profit_yoy"] == "2"
    assert [row.key for row in view.monthly] == ["2026-07", "2026-09"]
    assert view.month_order == [7, 8, 9, 10, 11, 12]
    full = history_view(data, HistoryFilter(), ["2026"])
    assert full.annual[-1].year_ago["profit"] == "30"
    assert full.annual[-1].current["profit"] == "390"
