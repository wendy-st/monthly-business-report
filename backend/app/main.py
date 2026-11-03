"""本机只读API优先读取已准备结果；首次筛选结果原子保存。"""

from functools import lru_cache
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.itk_api import router as itk_router
from app.schemas.business import BusinessView
from app.schemas.inventory import InventoryView
from app.schemas.overview import OverviewView
from app.schemas.products import ProductRefundQuery, ProductRefundView, ProductView
from app.schemas.reports import (
    FinancialQuery,
    FinancialView,
    HistoryFilter,
    ReportFilter,
    SourceStatus,
)
from app.services.cost_analysis import BasisAnalysis
from app.services.historical_report import HistoryView
from app.services.listing_report import ListingView
from app.services.prepared_reports import PreparedReports
from app.services.report_cache import data_root

app = FastAPI(title="月度经营报告", version="0.1.0")
app.include_router(itk_router)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
app.add_middleware(GZipMiddleware, minimum_size=1000)


@lru_cache(maxsize=1)
def reports() -> PreparedReports:
    try:
        return PreparedReports(data_root())
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=503, detail="9月数据尚未导入，请先运行本地只读导入。"
        ) from error


def result(
    month: str, resource: str, filters: ReportFilter | None = None, *, compact: bool = False
) -> FileResponse:
    if month != "2026-09":
        raise HTTPException(status_code=404, detail="该月份尚未导入")
    return FileResponse(
        reports().path(resource, filters, compact=compact),
        media_type="application/json",
        headers={"Cache-Control": "private, no-cache"},
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/reports/{month}/options", response_model=dict[str, list[str]])
def options(month: str) -> FileResponse:
    return result(month, "options")


@app.get(
    "/api/reports/{month}/financial",
    response_model=FinancialView | OverviewView | BusinessView | ProductView,
)
def financial(month: str, filters: Annotated[FinancialQuery, Query()]) -> FileResponse:
    scope = ReportFilter(**filters.model_dump(exclude={"view"}))
    if filters.view == "overview":
        return result(month, "overview", scope)
    if filters.view == "products":
        return result(month, "products", scope)
    if filters.view == "business":
        return result(month, "business", scope)
    return result(month, "financial", scope, compact=filters.view in {"overview", "business"})


@app.get("/api/reports/{month}/sources", response_model=SourceStatus)
def sources(month: str) -> FileResponse:
    return result(month, "sources")


@app.get("/api/reports/{month}/product-refunds", response_model=ProductRefundView)
def product_refunds(month: str, filters: Annotated[ProductRefundQuery, Query()]) -> FileResponse:
    return result(month, "product-refunds", filters)


@app.get("/api/reports/{month}/costs", response_model=list[BasisAnalysis])
def costs(month: str, filters: Annotated[ReportFilter, Query()]) -> FileResponse:
    return result(month, "costs", filters)


@app.get("/api/reports/{month}/inventory", response_model=InventoryView)
def inventory(month: str, filters: Annotated[ReportFilter, Query()]) -> FileResponse:
    return result(month, "inventory", filters)


@app.get("/api/reports/{month}/history", response_model=HistoryView)
def history(month: str, filters: Annotated[HistoryFilter, Query()]) -> FileResponse:
    return result(month, "history", filters)


@app.get("/api/reports/{month}/listing", response_model=ListingView)
def listing(month: str, filters: Annotated[ReportFilter, Query()]) -> FileResponse:
    return result(month, "listing", filters)
