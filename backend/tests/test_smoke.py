"""冒烟测试 — 验证 config / adapters 可正确导入和符合契约.

这些测试不依赖 torch / transformers, 只检查:
1. 模块能 import
2. 常量类型/取值合理
3. Adapter 类符合 DepthEstimator Protocol (鸭子类型)
4. 异常类层级正确
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


# ── config.py ───────────────────────────────────────────────


def test_config_imports_and_constants():
    from app import config

    # 端口和 host
    assert isinstance(config.HOST, str)
    assert isinstance(config.PORT, int) and 1 <= config.PORT <= 65535

    # CORS
    assert "http://localhost:5173" in config.CORS_ORIGINS

    # 输入限制
    assert config.MAX_IMAGE_DIM == 4096
    assert config.MAX_VIDEO_BYTES == 500 * 1024 * 1024
    assert config.MAX_VIDEO_SECONDS == 300

    # 路径
    assert config.APP_DIR.name == "app"
    assert config.BACKEND_DIR.name == "backend"
    assert config.TMP_DIR.exists()  # 模块导入时已 mkdir
    assert config.TMP_DIR.parent == config.APP_DIR  # 与 SPEC §11 一致


def test_config_model_registry_shape():
    from app.config import DEFAULT_MODEL_ID, MODEL_REGISTRY

    assert DEFAULT_MODEL_ID in MODEL_REGISTRY
    assert len(MODEL_REGISTRY) == 3  # small/base/large 三档

    for mid, entry in MODEL_REGISTRY.items():
        assert entry.id == mid  # 注册表 key 与 id 一致
        assert entry.size in {"small", "base", "large"}
        assert entry.estimated_vram_mb > 0
        assert entry.hf_repo.startswith("depth-anything/")


def test_adapter_factories_cover_all_registered_models():
    """完整性约束: ``MODEL_REGISTRY`` 中每个 model_id 都必须在
    ``ADAPTER_FACTORIES`` 中有对应工厂, 且不存在多余条目.

    防止以后加新模型时只改了一边, 导致 ``ModelManager.load()`` 在运行时才报错.
    """
    from app.config import MODEL_REGISTRY
    from app.services.model_manager import ADAPTER_FACTORIES, _factory_for

    registry_ids = set(MODEL_REGISTRY.keys())
    factory_ids = set(ADAPTER_FACTORIES.keys())
    assert registry_ids == factory_ids, (
        f"missing in factories: {registry_ids - factory_ids}; "
        f"extra in factories: {factory_ids - registry_ids}"
    )

    # 每个 entry 都能成功取到 callable
    for entry in MODEL_REGISTRY.values():
        assert callable(_factory_for(entry))


# ── adapters/base.py ───────────────────────────────────────


def test_protocol_definition():
    from app.adapters.base import DepthEstimator

    # Protocol 类: 字段在 __annotations__ 中, 方法在 dict 中
    annotations = DepthEstimator.__annotations__
    assert "model_id" in annotations
    assert "display_name" in annotations
    assert "estimated_vram_mb" in annotations
    # 方法是真实属性
    assert callable(DepthEstimator.load)
    assert callable(DepthEstimator.unload)
    assert callable(DepthEstimator.predict)


# ── adapters/depth_anything.py ─────────────────────────────


def test_depth_anything_adapter_class_definition():
    """验证类结构, 不实际 load (避免依赖 torch + 网络)."""
    from app.adapters.depth_anything import (
        DepthAnythingV2Adapter,
        build_depth_anything_v2,
    )

    # 构造实例: __init__ 不应触发 torch 导入
    adapter = DepthAnythingV2Adapter(
        model_id="depth-anything-v2-small",
        display_name="Depth Anything V2 · Small",
        hf_repo="depth-anything/Depth-Anything-V2-Small-hf",
        estimated_vram_mb=400,
    )
    assert adapter.model_id == "depth-anything-v2-small"
    assert adapter.estimated_vram_mb == 400
    assert adapter.is_loaded is False
    assert adapter.device == "cpu"

    # unload 在未加载时应是 no-op (幂等性)
    adapter.unload()
    assert adapter.is_loaded is False

    # build_depth_anything_v2 工厂可用
    from app.config import MODEL_REGISTRY

    entry = MODEL_REGISTRY["depth-anything-v2-small"]
    inst = build_depth_anything_v2(entry)
    assert inst.model_id == entry.id
    assert inst.estimated_vram_mb == entry.estimated_vram_mb


def test_protocol_runtime_isinstance():
    """DepthAnythingV2Adapter 实例应满足 DepthEstimator Protocol (rt-checkable)."""
    from app.adapters.base import DepthEstimator
    from app.adapters.depth_anything import DepthAnythingV2Adapter

    inst = DepthAnythingV2Adapter(
        model_id="x",
        display_name="x",
        hf_repo="x/y",
        estimated_vram_mb=1,
    )
    assert isinstance(inst, DepthEstimator)


def test_predict_without_load_raises():
    """未 load 就 predict 应该抛 ModelLoadError, 不会段错误."""
    from PIL import Image

    from app.adapters.depth_anything import DepthAnythingV2Adapter
    from app.core.exceptions import ModelLoadError

    inst = DepthAnythingV2Adapter(
        model_id="x",
        display_name="x",
        hf_repo="x/y",
        estimated_vram_mb=1,
    )
    img = Image.new("RGB", (32, 32))
    try:
        inst.predict(img)
    except ModelLoadError:
        pass
    else:
        raise AssertionError("应抛 ModelLoadError")


# ── core/exceptions.py ─────────────────────────────────────


def test_exceptions_hierarchy():
    from app.core.exceptions import (
        DepthLensError,
        ModelLoadError,
        ModelNotLoadedError,
        ModelOOMError,
        UnsupportedFormatError,
    )

    # 全部继承自 DepthLensError
    for cls in (
        ModelNotLoadedError,
        ModelLoadError,
        ModelOOMError,
        UnsupportedFormatError,
    ):
        assert issubclass(cls, DepthLensError)
        # status_code 和 user_message 必须有
        assert isinstance(cls.status_code, int)
        assert isinstance(cls.user_message, str) and cls.user_message

    # 特定 status_code 检查
    assert ModelNotLoadedError.status_code == 400
    assert ModelOOMError.status_code == 507
    assert UnsupportedFormatError.status_code == 415


# ── core/image_utils.py (已完成项, 顺手覆盖) ───────────────


def test_image_utils_pipeline():
    import io

    from PIL import Image

    from app.core.image_utils import prepare_image

    # 构造一张 RGBA 图, 写到内存里, 模拟上传
    img = Image.new("RGBA", (100, 80), (255, 0, 0, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")

    out = prepare_image(buf.getvalue(), max_dim=4096)
    assert out.mode == "RGB"
    assert out.size == (100, 80)


def test_image_utils_resize_oversized():
    import io

    from PIL import Image

    from app.core.image_utils import prepare_image

    img = Image.new("RGB", (5000, 3000))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    out = prepare_image(buf.getvalue(), max_dim=4096)
    # 长边应被缩到 4096
    assert max(out.size) == 4096
    # 比例保持
    assert out.size[0] / out.size[1] == 5000 / 3000 or abs(
        out.size[0] / out.size[1] - 5000 / 3000
    ) < 0.01


def test_image_utils_rejects_unsupported_format():
    from app.core.exceptions import InvalidImageError, UnsupportedFormatError
    from app.core.image_utils import prepare_image

    # 随机字节不是图像
    try:
        prepare_image(b"not an image", max_dim=4096)
    except (InvalidImageError, UnsupportedFormatError):
        pass
    else:
        raise AssertionError("应抛异常")


# ── 主入口 ──────────────────────────────────────────────────

if __name__ == "__main__":
    import inspect

    failed = 0
    passed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn) and inspect.isfunction(fn):
            try:
                fn()
                passed += 1
                print(f"  PASS  {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                import traceback

                print(f"  FAIL  {name}: {type(e).__name__}: {e}")
                traceback.print_exc()
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
