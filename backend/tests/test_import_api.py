"""绕过页面验证导入API、失败范围及多月份代理。"""

import asyncio
import json
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from unittest.mock import Mock, patch
from urllib.parse import quote, unquote, urlsplit

import pytest
from starlette.types import ASGIApp, Message, Scope

from app import import_api, main, web
from app.services.import_batches import create_batch, load_batch, recover_interrupted, save_batch
from tests.test_source_import import source_set


@dataclass
class ApiResponse:
    status_code: int
    body: bytes

    def json(self) -> Any:
        return json.loads(self.body)


class TestClient:
    __test__ = False

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    def request(
        self,
        method: str,
        path: str,
        *,
        content: bytes = b"",
        json: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ApiResponse:
        import json as codec

        body = codec.dumps(json).encode() if json is not None else content
        response: list[Message] = []
        parsed = urlsplit(path)
        scope: Scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": unquote(parsed.path),
            "raw_path": parsed.path.encode(),
            "query_string": parsed.query.encode(),
            "root_path": "",
            "server": ("testserver", 80),
            "client": ("testclient", 50000),
            "headers": [
                (b"host", b"testserver"),
                (b"content-length", str(len(body)).encode()),
                *[(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()],
            ],
        }
        if json is not None:
            scope["headers"].append((b"content-type", b"application/json"))

        async def receive() -> Message:
            return {"type": "http.request", "body": body, "more_body": False}

        async def send(message: Message) -> None:
            response.append(message)

        async def execute() -> None:
            await self.app(scope, receive, send)

        asyncio.run(execute())
        status = next(
            int(message["status"])
            for message in response
            if message["type"] == "http.response.start"
        )
        return ApiResponse(
            status,
            b"".join(
                message.get("body", b"")
                for message in response
                if message["type"] == "http.response.body"
            ),
        )

    def get(self, path: str) -> ApiResponse:
        return self.request("GET", path)

    def post(
        self,
        path: str,
        *,
        json: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ApiResponse:
        return self.request("POST", path, json=json, headers=headers)

    def put(self, path: str, *, content: bytes) -> ApiResponse:
        return self.request("PUT", path, content=content)


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    # Windows默认pytest目录名较长，使用独立短目录验证真实文件读写。
    with TemporaryDirectory(prefix="report-import-") as directory:
        monkeypatch.setenv("REPORT_DATA_DIR", directory)
        main.reports.cache_clear()
        yield TestClient(main.app)
        main.reports.cache_clear()


def test_real_upload_generation_months_and_report_routes(client: TestClient) -> None:
    with TemporaryDirectory(prefix="report-input-") as directory:
        source = source_set(Path(directory) / "sources")
        created = client.post("/api/imports", json={"month": "2026-10"})
        assert created.status_code == 201
        batch_id = created.json()["id"]
        for path in source.iterdir():
            uploaded = client.put(
                f"/api/imports/{batch_id}/files/{quote(path.name)}", content=path.read_bytes()
            )
            assert uploaded.status_code == 200
        assert client.get("/api/reports").json() == {"months": []}
        started = client.post(f"/api/imports/{batch_id}/run")
        assert started.status_code == 202
        assert client.get(f"/api/imports/{batch_id}").json()["status"] == "succeeded"
        assert client.get("/api/reports").json() == {"months": ["2026-10"]}
        report = client.get("/api/reports/2026-10/financial").json()
        assert report["report_month"] == "2026-10"
        assert report["summary"]["current"]["profit"] == "900"
        assert report["summary"]["previous"]["profit"] == "400"
        stock = client.get("/api/reports/2026-10/inventory").json()
        assert stock["summary"]["values"]["quantity"] == "100"
        assert "2026-10" in {row["dimensions"]["month"] for row in stock["turnover"]}
        assert all(row["month"] > "2026-10" for row in stock["future"])
        assert client.get("/api/reports/2026-11/financial").status_code == 404
        assert client.get("/api/reports/2026-99/financial").status_code == 422
        assert client.post(f"/api/imports/{batch_id}/run").status_code == 409
        assert (
            client.put(f"/api/imports/{batch_id}/files/late.xlsx", content=b"x").status_code == 409
        )


def test_invalid_upload_conflict_and_failed_batch_keep_month_unpublished(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert client.post("/api/imports", json={"month": "2026-13"}).status_code == 422
    assert (
        client.post(
            "/api/imports", json={"month": "2026-10"}, headers={"Origin": "https://example.com"}
        ).status_code
        == 403
    )
    batch_id = client.post("/api/imports", json={"month": "2026-10"}).json()["id"]
    assert client.put(f"/api/imports/{batch_id}/files/file.txt", content=b"x").status_code == 422
    assert (
        client.put(f"/api/imports/{batch_id}/files/file.xlsx", content=b"invalid").status_code
        == 422
    )
    monkeypatch.setattr(import_api, "MAX_FILE_BYTES", 2)
    assert (
        client.put(f"/api/imports/{batch_id}/files/file.xlsx", content=b"long").status_code == 413
    )
    assert client.get(f"/api/imports/{batch_id}").json()["files"] == []
    monkeypatch.setattr(import_api, "MAX_FILE_BYTES", 256 * 1024 * 1024)
    with TemporaryDirectory(prefix="report-input-") as directory:
        path = next(source_set(Path(directory) / "sources").iterdir())
        url = f"/api/imports/{batch_id}/files/{quote(path.name)}"
        assert client.put(url, content=path.read_bytes()).status_code == 200
        assert client.put(url, content=path.read_bytes()).status_code == 409
    client.post(f"/api/imports/{batch_id}/run")
    status = client.get(f"/api/imports/{batch_id}").json()
    assert status["status"] == "failed" and "缺少" in status["detail"]
    assert client.get("/api/reports").json() == {"months": []}
    assert client.get("/api/imports/not-an-id").status_code == 404


def test_proxy_forwards_upload_body_and_origin() -> None:
    upstream = Mock()
    upstream.status, upstream.read.return_value = 201, b'{"status":"uploading"}'
    upstream.getheaders.return_value = [("Content-Type", "application/json")]
    with patch("app.web.HTTPConnection") as connection:
        connection.return_value.getresponse.return_value = upstream
        result = TestClient(web.app).post(
            "/api/imports", json={"month": "2026-10"}, headers={"Origin": "http://127.0.0.1:5186"}
        )
        assert result.status_code == 201
        call = connection.return_value.request.call_args
        assert call.args[:2] == ("POST", "/api/imports")
        assert call.kwargs["headers"]["origin"] == "http://127.0.0.1:5186"
        assert call.kwargs["headers"]["Content-Length"] != "0"


def test_restart_marks_unfinished_batch_for_retry(tmp_path: Path) -> None:
    batch = create_batch(tmp_path, "2026-10")
    batch.status = "running"
    save_batch(tmp_path, batch)
    recover_interrupted(tmp_path)
    assert load_batch(tmp_path, batch.id).status == "failed"
    assert not (tmp_path / "report-2026-10.json").exists()
