"""本机ITK只读接口，与经营核算快照独立。"""

from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import TypeAdapter

from app.schemas.itk import (
    ComparisonQuery,
    ComparisonScope,
    ComparisonView,
    Options,
    OverviewExportScope,
    OverviewView,
    Scope,
)
from app.services.itk_data import dataset
from app.services.itk_export import comparison_csv, detail_rows, overview_csv
from app.services.itk_report import comparison, overview

router = APIRouter(prefix="/itk", tags=["ITK大盘"])


@router.get("/options", response_model=Options)
def options() -> Options:
    try:
        return dataset()[1]
    except FileNotFoundError as error:
        raise HTTPException(503, "ITK汇总CSV尚未就绪") from error


@router.get("/overview", response_model=OverviewView)
def get_overview(scope: Annotated[Scope, Query()]) -> OverviewView:
    try:
        return overview(scope)
    except FileNotFoundError as error:
        raise HTTPException(503, "ITK汇总CSV尚未就绪") from error
    except ValueError as error:
        raise HTTPException(422, "ITK筛选参数无效") from error


@router.get("/comparison", response_model=ComparisonView)
def get_comparison(scope: Annotated[ComparisonQuery, Query()]) -> ComparisonView:
    try:
        values = scope.model_dump()
        values["peers"] = (
            TypeAdapter(list[str]).validate_json(scope.peers) if scope.peers is not None else None
        )
        return comparison(ComparisonScope.model_validate(values))
    except FileNotFoundError as error:
        raise HTTPException(503, "ITK汇总CSV尚未就绪") from error
    except ValueError as error:
        raise HTTPException(422, "ITK筛选参数无效") from error


def download(content: bytes, name: str) -> Response:
    return Response(
        content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"},
    )


@router.get("/overview.csv")
def export_overview(scope: Annotated[OverviewExportScope, Query()]) -> Response:
    view = get_overview(Scope.model_validate(scope.model_dump()))
    try:
        rows = (
            detail_rows(view.rows, scope.search, scope.sort, scope.descending)
            if scope.details
            else view.rows
        )
    except ValueError as error:
        raise HTTPException(422, "ITK排序字段无效") from error
    return download(
        overview_csv(rows), f"ITK汇总_{view.scope.site}_{view.scope.start}_{view.scope.end}.csv"
    )


@router.get("/comparison.csv")
def export_comparison(scope: Annotated[ComparisonQuery, Query()]) -> Response:
    view = get_comparison(scope)
    return download(
        comparison_csv(view),
        f"ITK品牌月度对比_{view.scope.target}_{view.scope.site}_{view.scope.start}_{view.scope.end}.csv",
    )
