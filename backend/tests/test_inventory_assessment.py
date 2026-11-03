from decimal import Decimal
from unittest.mock import Mock, patch

from app.schemas.reports import ReportFilter
from app.services.inventory_assessment import active_listings
from app.services.inventory_readiness import assess_sku
from app.services.inventory_seasonal import season_rows
from app.services.inventory_sources import InventoryFact
from app.services.report_dataset import ReportDataset
from app.services.seasonal_risk import seasonal_risk
from app.services.source_import import record


def test_active_listings_only_accept_maintained_and_new_positions() -> None:
    dataset = Mock(spec=ReportDataset)
    dataset.month = "2026-09"
    dataset.records.return_value = [
        record(
            "source.xlsx",
            "产品基础信息表",
            i + 2,
            {"小组": "A", "站点": "CA", "LISTING": str(i), "产品定位": position},
        )
        for i, position in enumerate(["维护", "新品", "废弃", "已停运", ""])
    ]
    assert active_listings(dataset) == {("A", "CA", "0"), ("A", "CA", "1")}


def test_normal_diagnosis_is_not_counted_as_warning_just_because_it_has_explanation() -> None:
    dataset = Mock(spec=ReportDataset)
    dataset.month = "2026-09"
    dataset.manifest = {"report_month": "2026-09"}
    assessment = assess_sku({"group": "A", "site": "US", "listing": "X"}, [], {}, {}, "标准待补充")
    assessment.dimensions.update(issues="", notes="", diagnosis="整体库存正常")
    with patch(
        "app.services.seasonal_risk.season_context",
        return_value=("旺季", "2026-04", "2026-09", "2026-07"),
    ):
        result = seasonal_risk(dataset, ReportFilter(), {}, [], {}, assessment=assessment)
    assert result.reasons == ["整体库存正常"]
    assert result.level == "未见异常"


def test_listing_recalculates_from_totals_and_style_hides_zero_stock_skus() -> None:
    dataset = Mock(spec=ReportDataset)
    dataset.month = "2026-09"
    dataset.manifest = {"report_month": "2026-09"}
    dimensions = {
        "group": "A",
        "site": "CA",
        "listing": "X",
        "style": "X款",
        "category1": "C1",
        "category2": "C2",
        "category3": "C3",
        "sku": "X 40",
    }
    dataset.records.side_effect = lambda family: (
        [
            record(
                "source.xlsx",
                "产品基础信息表",
                2,
                {
                    "小组": "A",
                    "站点": "CA",
                    "LISTING": "X",
                    "产品定位": "维护",
                    "旺季月份": "10,11,12,1,2,3",
                },
            )
        ]
        if family == "products"
        else []
    )
    stocks = [
        InventoryFact(
            {**dimensions, "warehouse": warehouse},
            {
                "quantity": Decimal(quantity),
                "amount": Decimal(quantity),
                "in_stock": Decimal(quantity),
                "age270": Decimal(0),
            },
            record("source.xlsx", "库存数据", 2, {"可用量": quantity}),
        )
        for warehouse, quantity in [("本地仓", "100"), ("FBA仓", "50")]
    ]
    standards = {
        ("A", "CA", "X", "listing:X"): [
            {"积加SKU": "X 40", "产品款式": "X款", "总发货天数": "50", "运营保底下单天数": "70"},
            {"积加SKU": "X 41", "产品款式": "X款", "总发货天数": "55", "运营保底下单天数": "80"},
        ]
    }
    demand: dict[str, Decimal | None] = {"2026-10": Decimal(310)}
    visible = assess_sku(dimensions, stocks, demand, {}, "无标准")
    zero = assess_sku({**dimensions, "sku": "X 41"}, [], demand, {}, "无标准")
    forecasts = [
        (dimensions, demand),
        ({**dimensions, "sku": "X 41"}, demand),
        ({**dimensions, "listing": "retired"}, demand),
    ]
    filters = ReportFilter(group="A", site="CA", category3="C3")
    with (
        patch("app.services.inventory_seasonal.all_readiness", return_value=[visible, zero]),
        patch("app.services.inventory_forecast.forecast_records", return_value=(forecasts, 0)),
        patch("app.services.inventory_assessment.shipping_identity", return_value="test"),
        patch("app.services.inventory_assessment.shipping_index", return_value=standards),
    ):
        listing = season_rows(dataset, stocks, [], ("group", "site", "listing"), filters=filters)[0]
        style = season_rows(
            dataset, stocks, [], ("group", "site", "listing", "style"), filters=filters
        )[0]
    assert listing.values["shipping_days"] == "53"  # 52.5天向上取整。
    assert listing.values["order_days"] == "75"
    assert listing.values["standard_sku_count"] == "2"
    # 月内除法保留Decimal精度，允许最后一位舍入差；完整预测含零库存SKU的620件。
    assert abs(Decimal(listing.values["local_days"] or "0") - 5) < Decimal("1e-25")
    assert abs(Decimal(listing.values["shipping_rate"] or "0") - Decimal(5) / 53) < Decimal("1e-25")
    assert Decimal(listing.values["coverage"] or "0") == Decimal(50) / 620
    assert listing.dimensions["issues"] == "本地仓覆盖天数低于发货标准；三仓库存未达到保底需求"
    assert "缺口48.0天" in listing.risk.reasons[0]
    assert "三仓库存未达到保底需求" in listing.risk.reasons[0]
    assert listing.skus == []  # LISTING只显示自身汇总，款式才下钻。
    assert [sku.dimensions["sku"] for sku in style.skus] == ["X 40"]
