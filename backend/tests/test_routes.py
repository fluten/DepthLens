"""路由层集成测试 — 用 FastAPI TestClient 验证全部端点.

不依赖 torch / transformers: 通过 monkey-patch ``ModelManager`` 注入一个
返回梯度深度图的 ``FakeAdapter``, 验证整条 router → service → core 管线.

覆盖:
    GET  /api/health
    GET  /api/models
    POST /api/models/load           (成功 / 未知 id 404)
    POST /api/models/unload
    POST /api/depth/image           (成功 / 未加载 400 / 空 400)
    GET  /api/system/info
    全局异常处理 (DepthLensError → JSON)
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.main import create_app  # noqa: E402
from app.services import depth_service, model_manager  # noqa: E402


# ── FakeAdapter: 离线版深度模型, 不需要 torch ────────────────


class FakeAdapter:
    model_id = "fake-model"
    display_name = "Fake Model"
    estimated_vram_mb = 0
    device = "cpu"

    def load(self) -> None:
        pass

    def unload(self) -> None:
        pass

    def predict(self, image: Image.Image) -> np.ndarray:
        h, w = image.size[1], image.size[0]
        return np.linspace(0, 100, h * w, dtype=np.float32).reshape(h, w)


def _build_client_with_fake_model() -> TestClient:
    """构造一个 TestClient + 预先注入 FakeAdapter (绕过真正的 model load)."""
    model_manager.reset_model_manager_for_tests()
    depth_service.reset_depth_service_for_tests()

    mm = model_manager.get_model_manager()
    mm._current = FakeAdapter()  # type: ignore[assignment]
    mm._current_id = "fake-model"
    mm._status = "ready"

    return TestClient(create_app())


def _build_client_clean() -> TestClient:
    """构造干净 TestClient (无任何模型加载)."""
    model_manager.reset_model_manager_for_tests()
    depth_service.reset_depth_service_for_tests()
    return TestClient(create_app())


def _make_png_bytes(size: tuple[int, int] = (64, 48)) -> bytes:
    img = Image.new("RGB", size, (128, 64, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ── /api/health ───────────────────────────────────────────────


def test_health_returns_ok():
    client = _build_client_clean()
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["device"] in ("cpu", "cuda")
    assert body["models_loaded"] == []


def test_health_after_loading_lists_model():
    client = _build_client_with_fake_model()
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["models_loaded"] == ["fake-model"]


# ── /api/models ───────────────────────────────────────────────


def test_list_models_returns_three_entries():
    client = _build_client_clean()
    r = client.get("/api/models")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 3
    ids = {m["id"] for m in body}
    assert "depth-anything-v2-small" in ids
    for m in body:
        assert m["loaded"] is False


def test_load_model_with_unknown_id_returns_404():
    client = _build_client_clean()
    r = client.post("/api/models/load", json={"model_id": "no-such-model"})
    assert r.status_code == 404
    body = r.json()
    assert body["error"] == "ModelNotFoundError"
    assert "未知" in body["message"] or "ID" in body["message"]


def test_unload_when_idle_is_idempotent():
    client = _build_client_clean()
    r = client.post("/api/models/unload")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_unload_after_fake_load_clears_state():
    client = _build_client_with_fake_model()
    # 先确认 health 显示已加载
    assert client.get("/api/health").json()["models_loaded"] == ["fake-model"]
    # unload
    r = client.post("/api/models/unload")
    assert r.status_code == 200
    # 再次 health 显示空
    assert client.get("/api/health").json()["models_loaded"] == []


# ── /api/depth/image ──────────────────────────────────────────


def test_estimate_image_without_loaded_model_returns_400():
    client = _build_client_clean()
    files = {"image": ("test.png", _make_png_bytes(), "image/png")}
    r = client.post("/api/depth/image", files=files)
    assert r.status_code == 400
    body = r.json()
    assert body["error"] == "ModelNotLoadedError"


def test_estimate_image_with_fake_model_returns_depth():
    client = _build_client_with_fake_model()
    files = {"image": ("test.png", _make_png_bytes((80, 60)), "image/png")}
    r = client.post("/api/depth/image", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["width"] == 80
    assert body["height"] == 60
    assert body["model_id"] == "fake-model"
    assert body["device"] == "cpu"
    assert isinstance(body["depth_b64"], str)
    assert len(body["depth_b64"]) > 0
    # stats 必须在 [0, 1] 区间 (已归一化)
    assert 0.0 <= body["stats"]["min"] <= body["stats"]["max"] <= 1.0
    assert body["inference_ms"] >= 0


def test_estimate_image_invert_depth_query_param():
    client = _build_client_with_fake_model()
    files = {"image": ("test.png", _make_png_bytes((10, 10)), "image/png")}
    r1 = client.post("/api/depth/image", files=files)
    r2 = client.post("/api/depth/image?invert_depth=true", files=files)
    assert r1.status_code == r2.status_code == 200
    # 两次请求的 stats min+max 应当互补 (1 - x)
    s1 = r1.json()["stats"]
    s2 = r2.json()["stats"]
    assert abs((s1["max"] + s2["min"]) - 1.0) < 1e-5
    assert abs((s1["min"] + s2["max"]) - 1.0) < 1e-5


def test_estimate_image_with_unsupported_format_returns_415():
    client = _build_client_with_fake_model()
    # gif 不在白名单
    img = Image.new("P", (16, 16))
    buf = io.BytesIO()
    img.save(buf, format="GIF")
    files = {"image": ("test.gif", buf.getvalue(), "image/gif")}
    r = client.post("/api/depth/image", files=files)
    assert r.status_code == 415
    assert r.json()["error"] == "UnsupportedFormatError"


def test_estimate_image_with_garbage_bytes_returns_400():
    client = _build_client_with_fake_model()
    files = {"image": ("test.png", b"definitely not a png", "image/png")}
    r = client.post("/api/depth/image", files=files)
    assert r.status_code == 400
    assert r.json()["error"] == "InvalidImageError"


# ── /api/system/info ──────────────────────────────────────────


def test_system_info_basic_shape():
    client = _build_client_clean()
    r = client.get("/api/system/info")
    assert r.status_code == 200
    body = r.json()
    # 必有字段 (与 SystemInfo schema 对齐)
    assert "cpu" in body
    assert "ram_mb" in body
    assert "cuda_available" in body
    assert "torch_version" in body
    # cuda_available 是 bool
    assert isinstance(body["cuda_available"], bool)
    assert isinstance(body["ram_mb"], int)


# ── 全局错误形态 ──────────────────────────────────────────────


def test_validation_error_returns_json_shape():
    """缺 model_id 字段应返回 422 + 我们的统一 JSON 形态."""
    client = _build_client_clean()
    r = client.post("/api/models/load", json={})
    assert r.status_code == 422
    body = r.json()
    assert "error" in body
    assert "message" in body
    assert body["error"] == "RequestValidationError"


def test_unknown_route_returns_404():
    client = _build_client_clean()
    r = client.get("/api/no-such-route")
    assert r.status_code == 404


def test_root_endpoint():
    client = _build_client_clean()
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "DepthLens"
    assert body["docs"] == "/docs"


def test_swagger_docs_available():
    client = _build_client_clean()
    r = client.get("/docs")
    assert r.status_code == 200
    assert "swagger" in r.text.lower() or "openapi" in r.text.lower()


def test_openapi_schema_has_all_routes():
    client = _build_client_clean()
    r = client.get("/openapi.json")
    assert r.status_code == 200
    schema = r.json()
    paths = set(schema.get("paths", {}).keys())
    expected = {
        "/api/health",
        "/api/system/info",
        "/api/models",
        "/api/models/load",
        "/api/models/unload",
        "/api/depth/image",
    }
    assert expected <= paths, f"missing: {expected - paths}"
