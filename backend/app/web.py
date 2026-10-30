"""本机静态页面服务；生产构建与只读API仍使用原来的两个端口。"""

from http.client import HTTPConnection
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.get("/api/{path:path}")
def proxy(path: str, request: Request) -> Response:
    connection = HTTPConnection("127.0.0.1", 5187, timeout=180)
    target = f"/api/{path}" + (f"?{request.url.query}" if request.url.query else "")
    try:
        connection.request("GET", target)
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


@app.websocket("/{path:path}")
async def close_development_connection(websocket: WebSocket) -> None:
    # 已打开的旧开发页面可能继续尝试热更新连接，静态服务无需接受。
    await websocket.close()


app.mount(
    "/", StaticFiles(directory=Path(__file__).resolve().parents[2] / "frontend/dist", html=True)
)
