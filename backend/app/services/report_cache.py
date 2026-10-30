"""按源快照和核算代码版本保存派生结果，不修改原始快照。"""

from __future__ import annotations

import hashlib
import json
import os
from collections.abc import Callable
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import RLock

from pydantic import BaseModel


def data_root() -> Path:
    return Path(
        os.environ.get("REPORT_DATA_DIR", str(Path(__file__).resolve().parents[3] / "runtime/data"))
    )


def calculation_version() -> str:
    app = Path(__file__).resolve().parents[1]
    digest = hashlib.sha256()
    for folder in ("services", "schemas"):
        for path in sorted((app / folder).glob("*.py")):
            digest.update(str(path.relative_to(app)).encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def encode_result(value: object) -> bytes:
    def model(item: object) -> object:
        if isinstance(item, BaseModel):
            return item.model_dump(mode="json")
        raise TypeError(f"不能保存的报告结果类型：{type(item).__name__}")

    return json.dumps(value, default=model, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )


class ReportCache:
    def __init__(self, root: Path, version: str | None = None) -> None:
        self.root = root
        self.manifest = json.loads((root / "report-2026-09.json").read_text(encoding="utf-8"))
        self.identity = str(self.manifest["identity"])
        self.version = version or calculation_version()
        self.directory = root / "prepared" / self.identity / self.version
        self.lock = RLock()

    def result(
        self, resource: str, parameters: dict[str, object], build: Callable[[], object]
    ) -> Path:
        key = hashlib.sha256(encode_result([resource, sorted(parameters.items())])).hexdigest()
        target = self.directory / f"{key}.json"
        if target.exists():
            return target
        # 同进程的重复请求只生成一次；可重入以复用完整报告生成精简视图。
        with self.lock:
            if not target.exists():
                self.publish(target, encode_result(build()))
        return target

    def publish(self, target: Path, body: bytes) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(dir=target.parent, suffix=".pending", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(body)
        try:
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
