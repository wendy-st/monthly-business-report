"""本机报告API读取已准备结果；导入入口独立管理批次和月份发布。"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.import_api import router as import_router
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
from app.services.report_period import BASELINE_MONTH, ReportPeriod


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    from app.services.import_batches import recover_interrupted

    recover_interrupted(data_root())
    yield


app = FastAPI(title="月度经营报告", version="0.1.0", lifespan=lifespan)
app.include_router(itk_router, prefix="/api")
app.include_router(itk_router, prefix="/api/reports/2026-09", include_in_schema=False)
app.include_router(import_router)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
app.add_middleware(GZipMiddleware, minimum_size=1000)


@lru_cache(maxsize=12)
def reports(month: str = BASELINE_MONTH) -> PreparedReports:
    try:
        return PreparedReports(data_root(), month=month)
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=404, detail="该月份尚未导入，请在数据来源页面导入。"
        ) from error


def result(
    month: str, resource: str, filters: ReportFilter | None = None, *, compact: bool = False
) -> FileResponse:
    try:
        ReportPeriod(month)
    except ValueError as error:
        raise HTTPException(422, "报告月份无效") from error
    return FileResponse(
        reports(month).path(resource, filters, compact=compact),
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
