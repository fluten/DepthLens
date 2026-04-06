"""Phase 1 后端进阶集成测试 — 错误路径覆盖.

补 ``test_routes.py`` 没覆盖的错误码路径:

    - 507 ModelOOMError 自动 unload 链路 (CLAUDE.md 明文要求的兜底)
    - 413 ImageTooLargeError via HTTP
    - 502 ModelLoadError 精确路径 (走 ``except ModelLoadError`` 分支)
    - 显存预检 507 (注入 fake torch 模块到 sys.modules)
    - 全局 Exception handler 兜底: 非 DepthLensError → 500 + 内部错误
    - 空 bytes upload 由 core.image_utils 单一入口处理 (无中间层重复校验)

依赖:
    - ``conftest.py`` 提供 autouse 单例重置 fixture
    - ``_helpers.py`` 提供 fake adapters 和上下文管理器
"""

from __future__ import annotations

import types

from fastapi.testclient import TestClient

from app.config import MAX_IMAGE_BYTES
from app.core.exceptions import ModelLoadError, ModelNotFoundError
from app.main import create_app
from app.services import model_manager

from ._helpers import (
    GradientAdapter,
    OOMAdapter,
    install_adapter,
    make_png_bytes,
    temp_factory,
    temp_torch,
)


# ── 1) OOM 推理链路 ──────────────────────────────────────────


def test_inference_oom_triggers_auto_unload_and_returns_507():
    """推理 OOM: adapter 被 unload, manager.status=error, HTTP 507, 后续推理 400."""
    adapter = OOMAdapter()
    mm = install_adapter(adapter, model_id="oom")
    client = TestClient(create_app())

    files = {"image": ("a.png", make_png_bytes(), "image/png")}
    r = client.post("/api/depth/image", files=files)

    # (a) 响应正确
    assert r.status_code == 507
    body = r.json()
    assert body["error"] == "ModelOOMError"
    assert body["message"]  # 非空 user_message

    # (b) adapter 被卸载
    assert adapter.unload_called is True

    # (c) manager 状态被清空
    assert mm.current_id is None
    assert mm.status == "error"

    # (d) 后续 health 应反映模型已卸载
    health = client.get("/api/health").json()
    assert health["models_loaded"] == []

    # (e) 后续推理应返回 400 (无模型)
    r2 = client.post("/api/depth/image", files=files)
    assert r2.status_code == 400
    assert r2.json()["error"] == "ModelNotLoadedError"


# ── 2) 413 ImageTooLargeError ───────────────────────────────


def test_estimate_image_oversized_returns_413():
    """上传超过 MAX_IMAGE_BYTES (50MB) 的请求体 → 413 ImageTooLargeError."""
    install_adapter(GradientAdapter(), model_id="gradient")
    client = TestClient(create_app())

    big = b"x" * (MAX_IMAGE_BYTES + 1024)
    files = {"image": ("big.jpg", big, "image/jpeg")}
    r = client.post("/api/depth/image", files=files)

    assert r.status_code == 413
    body = r.json()
    assert body["error"] == "ImageTooLargeError"


# ── 3) 502 ModelLoadError 精确路径 ──────────────────────────


def test_model_load_failure_returns_502():
    """adapter.load() 直接抛 ModelLoadError → 502 (走精确 except 分支)."""

    class FailingAdapter:
        model_id = "fail"
        display_name = "Fail"
        estimated_vram_mb = 0
        device = "cpu"

        def load(self) -> None:
            raise ModelLoadError("synthetic network failure")

        def unload(self) -> None:
            pass

        def predict(self, image):  # pragma: no cover
            raise AssertionError("never called")

    def patched_factory_for(entry):
        # _factory_for 必须返回一个 callable: (entry) -> adapter
        return lambda e: FailingAdapter()

    with temp_factory(patched_factory_for):
        client = TestClient(create_app())
        r = client.post(
            "/api/models/load", json={"model_id": "depth-anything-v2-small"}
        )
        assert r.status_code == 502
        body = r.json()
        assert body["error"] == "ModelLoadError"
        # manager 状态应是 error, current_id 应是 None
        mm = model_manager.get_model_manager()
        assert mm.status == "error"
        assert mm.current_id is None


# ── 4) 显存预检 507 (fake torch) ────────────────────────────


def test_vram_precheck_returns_507_when_insufficient():
    """显存预检: free_mb < needed_mb → 507, 且 adapter 工厂完全未被调用."""
    fake_torch = types.ModuleType("torch")
    fake_cuda = types.SimpleNamespace()
    fake_cuda.is_available = lambda: True
    # 10MB free, 12GB total — 远低于 small (400MB + 256MB margin)
    fake_cuda.mem_get_info = lambda: (10 * 1024 * 1024, 12 * 1024 * 1024 * 1024)
    fake_cuda.empty_cache = lambda: None
    fake_cuda.memory_allocated = lambda: 0
    fake_torch.cuda = fake_cuda  # type: ignore[attr-defined]

    factory_called = []

    def tracking_factory(entry):
        factory_called.append(entry.id)
        return lambda e: GradientAdapter()

    with temp_torch(fake_torch), temp_factory(tracking_factory):
        client = TestClient(create_app())
        r = client.post(
            "/api/models/load", json={"model_id": "depth-anything-v2-small"}
        )
        assert r.status_code == 507
        body = r.json()
        assert body["error"] == "ModelOOMError"
        # 关键: 工厂在预检失败后绝不应被调用
        assert factory_called == []
        # current_id 必须 None
        assert model_manager.get_model_manager().current_id is None


# ── 5a) DepthLensError 透传 (Bug #3) ──────────────────────


def test_factory_raising_depthlens_error_is_not_wrapped_as_502():
    """工厂抛 ModelNotFoundError (一种 DepthLensError) 时, 应原样透传 → 404,
    而不是被 ModelManager.load() 的 ``except Exception`` 兜底包装成 502.

    回归保护 Bug #3.
    """

    def patched_factory_for(entry):
        # 直接在工厂层抛 ModelNotFoundError, 模拟未来某个 adapter 工厂自身的判断
        raise ModelNotFoundError("synthetic factory rejection")

    with temp_factory(patched_factory_for):
        client = TestClient(create_app())
        r = client.post(
            "/api/models/load", json={"model_id": "depth-anything-v2-small"}
        )
        # 关键: 应该是 404, 不是 502
        assert r.status_code == 404
        body = r.json()
        assert body["error"] == "ModelNotFoundError"


# ── 5) 空 bytes upload — image_utils 单一入口 ─────────────


def test_empty_bytes_upload_returns_400_via_image_utils():
    """空 bytes multipart 上传应被 core.image_utils.decode_image 抛 400.

    回归保护: 验证删除 routers/depth.py + depth_service.py 里的冗余空检查后,
    空 bytes 仍能被正确处理 (而不是悄悄过去触发更深的崩溃).
    """
    install_adapter(GradientAdapter(), model_id="gradient")
    client = TestClient(create_app())
    files = {"image": ("empty.png", b"", "image/png")}
    r = client.post("/api/depth/image", files=files)
    assert r.status_code == 400
    body = r.json()
    assert body["error"] == "InvalidImageError"


# ── 6) 全局 Exception handler 兜底 → 500 ────────────────


def test_unknown_exception_in_predict_returns_500():
    """非 DepthLensError 异常 (RuntimeError) → 500 + InternalError + 内部错误."""

    class BrokenAdapter:
        model_id = "broken"
        display_name = "Broken"
        estimated_vram_mb = 0
        device = "cpu"

        def load(self) -> None:
            pass

        def unload(self) -> None:
            pass

        def predict(self, image):
            raise RuntimeError("totally unexpected internal failure")

    install_adapter(BrokenAdapter(), model_id="broken")
    # raise_server_exceptions=False 让 TestClient 把异常交给注册的 handler 处理,
    # 而不是直接重抛 (默认行为)
    client = TestClient(create_app(), raise_server_exceptions=False)
    files = {"image": ("a.png", make_png_bytes(), "image/png")}
    r = client.post("/api/depth/image", files=files)
    assert r.status_code == 500
    body = r.json()
    assert body["error"] == "InternalError"
    assert body["message"] == "内部错误"
