"""错误响应形态 / 错误优先级 端到端测试.

把 ``test_routes.py`` 里跟 "errors" 相关的进阶 case 单独拿出来, 避免单文件
超 300 行. 内容覆盖 Bug #1 (Starlette 404/405 形态) 和 Bug #2 (无模型时
图片错的优先级).

依赖:
    - ``conftest.py`` 提供 autouse 单例重置 fixture
    - ``_helpers.py`` 提供 fake adapters 等
"""

from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app


# ── Bug #1: 404/405 错误形态统一 ─────────────────────────────


def test_unknown_route_returns_404_with_unified_shape():
    """未匹配路径应返回 404 + ``{error, message}`` 统一形态.

    回归保护 Bug #1: 之前 Starlette 默认 404 直接返回 ``{"detail": "..."}``,
    绕过 main.py 的 HTTPException handler. 修复后 main.py 注册的是
    ``starlette.exceptions.HTTPException``, 这两个 case 也走统一形态.
    """
    client = TestClient(create_app())
    r = client.get("/api/no-such-route")
    assert r.status_code == 404
    body = r.json()
    assert "error" in body
    assert "message" in body
    assert body["error"] == "HTTPException"
    assert body["message"] == "Not Found"


def test_wrong_method_returns_405_with_unified_shape():
    """对 POST 端点发 GET 应返回 405 + ``{error, message}`` 统一形态.

    与 test_unknown_route_returns_404_with_unified_shape 同源 (Bug #1):
    Starlette 默认 405 也曾绕过 handler, 现已修复.
    """
    client = TestClient(create_app())
    r = client.get("/api/depth/image")  # POST-only endpoint
    assert r.status_code == 405
    body = r.json()
    assert body["error"] == "HTTPException"
    assert body["message"] == "Method Not Allowed"


# ── Bug #2: 无模型时图片错的优先级 ────────────────────────


def test_no_model_loaded_takes_priority_over_image_errors():
    """无模型时, 任何图片错 (空/坏/不支持格式) 都应优先返回 ModelNotLoadedError.

    这是 ``DepthService.estimate_image`` 的有意优先级 — "请先加载模型" 比
    "图片是坏的" 对用户更可操作, 而且能省 PIL 解码 CPU. 前端 UI 应在拖入
    图片前先确保模型已加载.

    回归保护 Bug #2 (全局检查发现): 之前所有图片错的测试都先安装了 fake adapter,
    没人测过 "无模型 + 图片错" 路径. 实际生产场景下这个优先级没被锁定.
    """
    # 准备 3 种坏 payload
    bad_payloads: list[tuple[str, bytes, str]] = [
        ("empty.png", b"", "image/png"),
        ("garbage.png", b"definitely not a png", "image/png"),
    ]
    gif_img = Image.new("P", (16, 16))
    gif_buf = io.BytesIO()
    gif_img.save(gif_buf, format="GIF")
    bad_payloads.append(("a.gif", gif_buf.getvalue(), "image/gif"))

    # 每次都用干净 client (无模型). conftest autouse fixture 已重置单例.
    for filename, content, ctype in bad_payloads:
        client = TestClient(create_app())
        files = {"image": (filename, content, ctype)}
        r = client.post("/api/depth/image", files=files)
        assert r.status_code == 400, (
            f"{filename}: expected 400, got {r.status_code} {r.text}"
        )
        body = r.json()
        assert body["error"] == "ModelNotLoadedError", (
            f"{filename}: expected ModelNotLoadedError to take priority, "
            f"got {body['error']}"
        )
