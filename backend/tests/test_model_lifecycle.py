"""Phase 1 后端进阶集成测试 — 模型生命周期 & 语义正确性.

补 ``test_routes.py`` 没覆盖的状态转换路径:

    - 跨模型切换 (load A → load B 后 A 必须被 unload)
    - 同 model_id 重复 load 的幂等性 (adapter.load 只被调一次)
    - invert_depth 的真实空间反转 (像素级 decoded bytes 比对)

依赖:
    - ``conftest.py`` 提供 autouse 单例重置 fixture
    - ``_helpers.py`` 提供 fake adapters 和上下文管理器
"""

from __future__ import annotations

import base64

import numpy as np
from fastapi.testclient import TestClient

from app.main import create_app
from app.services import model_manager

from ._helpers import (
    GradientAdapter,
    TrackingAdapter,
    install_adapter,
    make_png_bytes,
    temp_factory,
)


# ── 1) 跨模型切换 ──────────────────────────────────────────


def test_loading_second_model_unloads_the_first():
    """load A → load B: A.loaded 应变 False, B.loaded 应是 True."""
    adapter_a = TrackingAdapter("depth-anything-v2-small")
    adapter_b = TrackingAdapter("depth-anything-v2-base")
    table = {
        "depth-anything-v2-small": adapter_a,
        "depth-anything-v2-base": adapter_b,
    }

    def factory_for(entry):
        return lambda e: table[entry.id]

    with temp_factory(factory_for):
        client = TestClient(create_app())

        r1 = client.post(
            "/api/models/load", json={"model_id": "depth-anything-v2-small"}
        )
        assert r1.status_code == 200, r1.text
        assert adapter_a.loaded is True
        assert adapter_b.loaded is False

        r2 = client.post(
            "/api/models/load", json={"model_id": "depth-anything-v2-base"}
        )
        assert r2.status_code == 200, r2.text
        assert adapter_a.loaded is False  # 关键: A 已被 unload
        assert adapter_b.loaded is True

        mm = model_manager.get_model_manager()
        assert mm.current_id == "depth-anything-v2-base"

        # /api/models 也应反映新状态
        listed = client.get("/api/models").json()
        loaded_flags = {m["id"]: m["loaded"] for m in listed}
        assert loaded_flags["depth-anything-v2-small"] is False
        assert loaded_flags["depth-anything-v2-base"] is True


# ── 2) 同 model_id 重复 load 幂等 ────────────────────────


def test_loading_same_model_twice_is_idempotent():
    """同一个 model_id 连续 load 两次, adapter.load() 应只被调一次."""
    adapter = TrackingAdapter("depth-anything-v2-small")

    def factory_for(entry):
        return lambda e: adapter

    with temp_factory(factory_for):
        client = TestClient(create_app())
        r1 = client.post(
            "/api/models/load", json={"model_id": "depth-anything-v2-small"}
        )
        r2 = client.post(
            "/api/models/load", json={"model_id": "depth-anything-v2-small"}
        )
        assert r1.status_code == r2.status_code == 200
        assert adapter.load_count == 1  # 第二次 load 是 no-op
        assert adapter.loaded is True
        assert (
            model_manager.get_model_manager().current_id
            == "depth-anything-v2-small"
        )


# ── 3) invert_depth 真实空间反转 ────────────────────────


def test_invert_depth_actually_reverses_pixel_values():
    """像素级验证: invert=true 后 inverted[i,j] == 1.0 - normal[i,j]."""
    install_adapter(GradientAdapter(), model_id="gradient")
    client = TestClient(create_app())

    files = {"image": ("a.png", make_png_bytes((8, 4)), "image/png")}
    r_normal = client.post("/api/depth/image", files=files)
    r_inv = client.post("/api/depth/image?invert_depth=true", files=files)
    assert r_normal.status_code == r_inv.status_code == 200

    def decode(body) -> np.ndarray:
        b64 = body["depth_b64"]
        arr = np.frombuffer(base64.b64decode(b64), dtype=np.float32)
        return arr.reshape(body["height"], body["width"])

    normal = decode(r_normal.json())
    inverted = decode(r_inv.json())

    # (a) shape 一致
    assert normal.shape == inverted.shape == (4, 8)
    # (b) 像素级反转: inverted == 1 - normal (允许 float32 误差)
    assert np.allclose(inverted, 1.0 - normal, atol=1e-6)
    # (c) 显然 normal 和 inverted 不应相等 — 防止 invert 是 no-op 的 bug
    assert not np.allclose(normal, inverted)
    # (d) 输入是单调梯度, 所以归一化后 normal[0]≈0, normal[-1]≈1
    flat_normal = normal.flatten()
    assert flat_normal[0] < 0.01
    assert flat_normal[-1] > 0.99
    # 反转后第一格应接近 1, 最后一格接近 0
    flat_inv = inverted.flatten()
    assert flat_inv[0] > 0.99
    assert flat_inv[-1] < 0.01
