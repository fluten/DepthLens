"""FastAPI 入口 — App 创建 / 中间件 / 全局异常处理 / Router 注册.

启动:
    uvicorn app.main:app --reload --port 8000

设计:
    - 所有 ``DepthLensError`` 统一序列化为 ``{error: ClassName, message: user_message}``
      前端 ``services/api.ts`` 拦截后直接走 Toast.
    - 注册 ``starlette.exceptions.HTTPException`` (而非 ``fastapi.HTTPException``)
      的 handler, 这样 Starlette 路由层抛的 404 / 405 也能走统一形态. FastAPI 的
      HTTPException 是 Starlette 那个的子类, 所以一并被覆盖.
    - 其他未捕获的异常 → 500 + ``"内部错误"`` 兜底, 真实信息进日志.
    - CORS 仅放开 :data:`config.CORS_ORIGINS`, 默认是 Vite dev server.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import CORS_ORIGINS
from .core.exceptions import DepthLensError
from .routers import depth, models, system

# ── logging ───────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("depthlens")


# ── app ───────────────────────────────────────────────────────


def create_app() -> FastAPI:
    """工厂函数: 构造并返回 FastAPI 实例.

    用工厂而非模块级 ``app = FastAPI()`` 的好处是测试时可以创建独立实例,
    避免单例污染.
    """
    application = FastAPI(
        title="DepthLens Backend",
        description="单目深度估计服务端 — Phase 1 (REST only)",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,
    )

    # ── CORS ─────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── 全局异常处理器 ──────────────────────────────────
    _register_exception_handlers(application)

    # ── 路由注册 ────────────────────────────────────────
    application.include_router(system.router)
    application.include_router(models.router)
    application.include_router(depth.router)

    @application.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {"name": "DepthLens", "docs": "/docs", "health": "/api/health"}

    logger.info(
        "DepthLens backend ready (CORS allow_origins=%s)", CORS_ORIGINS
    )
    return application


# ── 异常处理 ──────────────────────────────────────────────────


def _register_exception_handlers(application: FastAPI) -> None:
    """注册三个 handler: DepthLensError / HTTPException / 兜底 500."""

    @application.exception_handler(DepthLensError)
    async def _handle_depthlens_error(
        _request: Request, exc: DepthLensError
    ) -> JSONResponse:
        # 业务异常: 把内部 detail 写日志, 给前端 user_message
        logger.warning(
            "DepthLensError %s (%s): %s",
            exc.__class__.__name__,
            exc.status_code,
            exc.detail or exc.user_message,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.__class__.__name__,
                "message": exc.user_message,
            },
        )

    @application.exception_handler(RequestValidationError)
    async def _handle_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Pydantic 422 校验失败: 拼一个简短的人话提示
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(x) for x in first.get("loc", []))
        msg = first.get("msg", "请求参数错误")
        return JSONResponse(
            status_code=422,
            content={
                "error": "RequestValidationError",
                "message": f"{loc}: {msg}" if loc else msg,
            },
        )

    @application.exception_handler(StarletteHTTPException)
    async def _handle_http_exception(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        # 注册 Starlette 的 HTTPException 而非 FastAPI 的, 这样:
        # - FastAPI 的 HTTPException (它继承 Starlette 那个) 仍然被覆盖
        # - Starlette 路由层为未匹配 path / 错方法直接返回的 404 / 405 也走这里
        # 否则那两种情形会绕过本 handler, 返回默认的 ``{"detail": "..."}``,
        # 破坏前端 "只处理一种错误形态" 的承诺.
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "HTTPException",
                "message": str(exc.detail),
            },
        )

    @application.exception_handler(Exception)
    async def _handle_unknown(_request: Request, exc: Exception) -> JSONResponse:
        # 兜底: 任何未捕获异常都不暴露 traceback 给前端
        logger.exception("Unhandled exception: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": "InternalError", "message": "内部错误"},
        )


# ── 模块级实例 (uvicorn 引用) ────────────────────────────────

app = create_app()
