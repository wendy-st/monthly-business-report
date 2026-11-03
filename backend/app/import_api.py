"""本机多月份登记和Excel导入接口；上传内容留在运行目录。"""

import os
import threading
from pathlib import Path
from typing import Annotated
from zipfile import BadZipFile, ZipFile

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field

from app.services.import_batches import (
    ImportBatch,
    batch_directory,
    create_batch,
    load_batch,
    run_batch,
    save_batch,
)
from app.services.report_cache import data_root

router = APIRouter(prefix="/api")
_batch_lock = threading.Lock()
MAX_FILE_BYTES = int(os.environ.get("REPORT_IMPORT_MAX_FILE_BYTES", str(256 * 1024 * 1024)))
MAX_BATCH_BYTES = int(os.environ.get("REPORT_IMPORT_MAX_BATCH_BYTES", str(1024 * 1024 * 1024)))


class ImportRequest(BaseModel):
    month: Annotated[str, Field(pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")]


def local_write(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin not in {
        "http://127.0.0.1:5186",
        "http://localhost:5186",
        "http://127.0.0.1:5188",
        "http://localhost:5188",
    }:
        raise HTTPException(403, "导入仅允许从本机报告页面发起")


def batch_or_404(batch_id: str) -> ImportBatch:
    try:
        return load_batch(data_root(), batch_id)
    except (ValueError, FileNotFoundError) as error:
        raise HTTPException(404, "导入批次不存在") from error


@router.get("/reports")
def months() -> dict[str, list[str]]:
    return {
        "months": sorted(
            (p.stem.removeprefix("report-") for p in data_root().glob("report-*.json")),
            reverse=True,
        )
    }


@router.post("/imports", response_model=ImportBatch, status_code=201)
def create(payload: ImportRequest, request: Request) -> ImportBatch:
    local_write(request)
    return create_batch(data_root(), payload.month)


@router.get("/imports/{batch_id}", response_model=ImportBatch)
def status(batch_id: str) -> ImportBatch:
    return batch_or_404(batch_id)


@router.put("/imports/{batch_id}/files/{filename}", response_model=ImportBatch)
async def upload(batch_id: str, filename: str, request: Request) -> ImportBatch:
    local_write(request)
    batch = batch_or_404(batch_id)
    if batch.status != "uploading":
        raise HTTPException(409, "此批次已开始处理，请创建新批次")
    if (
        Path(filename).name != filename
        or any(c in filename for c in "/\\:")
        or not filename.endswith(".xlsx")
    ):
        raise HTTPException(422, "仅允许上传文件名有效的.xlsx文件")
    folder = batch_directory(data_root(), batch_id) / "uploads"
    target = folder / filename
    if target.exists():
        raise HTTPException(409, "本批次已有同名文件")
    pending = target.with_suffix(".pending")
    size = 0
    existing = sum(p.stat().st_size for p in folder.glob("*.xlsx"))
    try:
        with pending.open("xb") as stream:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_FILE_BYTES or existing + size > MAX_BATCH_BYTES:
                    raise HTTPException(413, "文件或批次超过导入大小限制")
                stream.write(chunk)
        with ZipFile(pending) as archive:
            if (
                "xl/workbook.xml" not in archive.namelist()
                or sum(p.file_size for p in archive.infolist()) > MAX_BATCH_BYTES * 4
            ):
                raise HTTPException(422, "文件不是有效Excel工作簿或解压体积过大")
        pending.replace(target)
    except BadZipFile as error:
        raise HTTPException(422, "文件不是有效的.xlsx工作簿") from error
    finally:
        pending.unlink(missing_ok=True)
    with _batch_lock:
        batch = batch_or_404(batch_id)
        batch.files.append(filename)
        batch.detail = f"已上传{len(batch.files)}份文件，尚未导入"
        save_batch(data_root(), batch)
    return batch


@router.post("/imports/{batch_id}/run", response_model=ImportBatch, status_code=202)
def start(batch_id: str, request: Request, tasks: BackgroundTasks) -> ImportBatch:
    local_write(request)
    with _batch_lock:
        batch = batch_or_404(batch_id)
        if batch.status != "uploading" or not batch.files:
            raise HTTPException(409, "批次已处理或尚未上传文件")
        batch.status, batch.detail = "running", "已开始检查并生成报告"
        save_batch(data_root(), batch)
    tasks.add_task(run_batch, data_root(), batch_id)
    return batch
