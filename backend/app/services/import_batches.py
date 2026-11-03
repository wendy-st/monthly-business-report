"""本机导入批次：先在隔离目录核算，全部成功后原子登记月份。"""

from __future__ import annotations

import json
import shutil
import threading
import uuid
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from app.services.prepare_reports import prepare
from app.services.report_cache import encode_result, prepared_source
from app.services.report_period import ReportPeriod
from app.services.source_import import import_sources
from app.services.source_preflight import inspect_sources

_publication_lock = threading.Lock()


class ImportBatch(BaseModel):
    id: str
    month: str
    status: Literal["uploading", "running", "succeeded", "failed"] = "uploading"
    detail: str = "请选择配套Excel文件"
    files: list[str] = []


def batch_directory(root: Path, batch_id: str) -> Path:
    if str(uuid.UUID(batch_id)) != batch_id:
        raise ValueError("导入批次不存在")
    return root / "imports" / batch_id


def save_batch(root: Path, batch: ImportBatch) -> None:
    target = batch_directory(root, batch.id) / "status.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".pending")
    temporary.write_bytes(encode_result(batch))
    temporary.replace(target)


def load_batch(root: Path, batch_id: str) -> ImportBatch:
    return ImportBatch.model_validate_json(
        (batch_directory(root, batch_id) / "status.json").read_bytes()
    )


def create_batch(root: Path, month: str) -> ImportBatch:
    ReportPeriod(month)
    batch = ImportBatch(id=str(uuid.uuid4()), month=month)
    (batch_directory(root, batch.id) / "uploads").mkdir(parents=True)
    save_batch(root, batch)
    return batch


def publish_sources(source: Path, root: Path, month: str, work: Path) -> str:
    """重复来源复用；不同来源拒绝覆盖；失败不会创建可选月份。"""
    with _publication_lock:
        pointer = root / f"report-{month}.json"
        if pointer.exists():
            import_sources(source, root, month)
            return "相同来源已登记，直接复用原报告"
        plan = inspect_sources(source, month)
        if not plan["structure_complete"]:
            raise ValueError(
                "；".join(
                    [
                        *plan["missing_files"],
                        *[
                            f"{item['file']}缺少工作表：{item['missing_sheets']}"
                            for item in plan["files"]
                            if item["missing_sheets"]
                        ],
                    ]
                )
            )
        snapshot = import_sources(source, work, month)
        manifest = json.loads((work / f"report-{month}.json").read_text(encoding="utf-8"))
        if pointer.exists():
            old = json.loads(pointer.read_text(encoding="utf-8"))
            if old["identity"] != manifest["identity"]:
                raise ValueError(f"{month}已有不同来源，已停止导入；原报告未覆盖")
            return "相同来源已登记，直接复用原报告"
        prepare(work, month)
        destination = root / "snapshots" / manifest["identity"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            snapshot.rename(destination)
        prepared = prepared_source(work, manifest["identity"])
        shutil.copytree(prepared, prepared_source(root, manifest["identity"]), dirs_exist_ok=True)
        pending = root / f"report-{month}.pending"
        pending.write_bytes(encode_result(manifest))
        pending.replace(pointer)
        return "导入及报告生成完成，可切换报告月份；经营金额待核对"


def recover_interrupted(root: Path) -> None:
    for path in (root / "imports").glob("*/status.json"):
        batch = ImportBatch.model_validate_json(path.read_bytes())
        if batch.status == "running":
            batch.status, batch.detail = (
                "failed",
                "本地服务中断，批次未完成；请重新导入，已发布月份保持原样",
            )
            save_batch(root, batch)


def run_batch(root: Path, batch_id: str) -> None:
    batch = load_batch(root, batch_id)
    directory = batch_directory(root, batch_id)
    try:
        batch.detail = "正在检查源表并生成报告，请勿关闭本地服务"
        save_batch(root, batch)
        batch.detail = publish_sources(directory / "uploads", root, batch.month, directory / "work")
        batch.status = "succeeded"
    except ValueError as error:
        batch.status, batch.detail = "failed", str(error)
    except Exception:
        # 对外只返回可操作提示，技术堆栈由服务端日志保留。
        import logging

        logging.exception("导入批次失败：%s", batch_id)
        batch.status = "failed"
        batch.detail = "导入失败，原报告未改变。请检查源表、公式缓存及本地服务日志后重试。"
    save_batch(root, batch)
