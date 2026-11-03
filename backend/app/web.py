"""本机静态页面服务；生产构建与本机API仍使用原来的两个端口。"""

from http.client import HTTPConnection
from pathlib import Path
from tempfile import SpooledTemporaryFile

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.import_api import MAX_FILE_BYTES

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
app.add_middleware(GZipMiddleware, minimum_size=1000)


def forward(
    method: str, target: str, body: SpooledTemporaryFile[bytes], headers_in: dict[str, str]
) -> Response:
    """在线程池中访问后端，避免长时间生成报告阻塞页面请求。"""
    connection = HTTPConnection("127.0.0.1", 5187, timeout=180)
    try:
        connection.request(method, target, body=body, headers=headers_in)
        upstream = connection.getresponse()
        headers = {
            key: value
            for key, value in upstream.getheaders()
            if key.lower() in {"content-type", "cache-control", "etag", "last-modified"}
        }
        return Response(upstream.read(), status_code=upstream.status, headers=headers)
    except OSError:
        return JSONResponse({"detail": "本地后端尚未就绪，请稍后重试。"}, status_code=503)
    finally:
        connection.close()


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT"])
async def proxy(path: str, request: Request) -> Response:
    target = f"/api/{path}" + (f"?{request.url.query}" if request.url.query else "")
    headers_in = {
        key: value
        for key, value in request.headers.items()
        if key.lower() in {"content-type", "origin"}
    }
    with SpooledTemporaryFile(max_size=1024 * 1024) as body:
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_FILE_BYTES:
                return JSONResponse({"detail": "文件超过导入大小限制"}, status_code=413)
            body.write(chunk)
        body.seek(0)
        headers_in["Content-Length"] = str(size)
        return await run_in_threadpool(forward, request.method, target, body, headers_in)


@app.websocket("/{path:path}")
async def close_development_connection(websocket: WebSocket) -> None:
    # 已打开的旧开发页面可能继续尝试热更新连接，静态服务无需接受。
    await websocket.close()


app.mount(
    "/", StaticFiles(directory=Path(__file__).resolve().parents[2] / "frontend/dist", html=True)
)
