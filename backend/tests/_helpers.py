"""共享测试工具 — fake adapters + 上下文管理器 + 工具函数.

下划线前缀使得 pytest 不会把本文件当成测试文件收集. 仅供其他 ``test_*.py``
显式 import.
"""

from __future__ import annotations

import io
import sys
from contextlib import contextmanager
from typing import Iterator

import numpy as np
from PIL import Image

from app.core.exceptions import ModelOOMError
from app.services import depth_service, model_manager


# ── 字节流工具 ────────────────────────────────────────────────


def make_png_bytes(size: tuple[int, int] = (16, 16)) -> bytes:
    """构造一张指定尺寸的纯色 PNG, 用于 multipart 上传测试."""
    img = Image.new("RGB", size, (128, 64, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ── 状态注入 ──────────────────────────────────────────────────


def install_adapter(adapter, model_id: str = "fake") -> "model_manager.ModelManager":
    """直接把 adapter 塞进 ModelManager (绕过真正的 load() 流程).

    用于测试已加载状态下的推理路径. 不测 load 本身.
    """
    mm = model_manager.get_model_manager()
    mm._current = adapter  # type: ignore[assignment]
    mm._current_id = model_id
    mm._status = "ready"
    return mm


# ── 上下文管理器 ───────────────────────────────────────────


@contextmanager
def temp_factory(factory_fn) -> Iterator[None]:
    """临时替换 ``model_manager._factory_for``, 退出 with 块时还原."""
    import app.services.model_manager as mm_mod

    original = mm_mod._factory_for
    mm_mod._factory_for = factory_fn  # type: ignore[assignment]
    try:
        yield
    finally:
        mm_mod._factory_for = original  # type: ignore[assignment]


@contextmanager
def temp_torch(fake_torch) -> Iterator[None]:
    """临时注入 fake torch 模块到 ``sys.modules``, 退出时还原."""
    saved = sys.modules.get("torch")
    sys.modules["torch"] = fake_torch
    try:
        yield
    finally:
        if saved is not None:
            sys.modules["torch"] = saved
        else:
            sys.modules.pop("torch", None)


# ── Fake adapters ─────────────────────────────────────────────


class GradientAdapter:
    """对任意输入图返回单调递增的 0..N 梯度深度."""

    model_id = "gradient"
    display_name = "Gradient"
    estimated_vram_mb = 0
    device = "cpu"

    def load(self) -> None:
        pass

    def unload(self) -> None:
        pass

    def predict(self, image: Image.Image) -> np.ndarray:
        h, w = image.size[1], image.size[0]
        return np.linspace(0, 100, h * w, dtype=np.float32).reshape(h, w)


class OOMAdapter:
    """predict() 永远抛 ModelOOMError, 用于 OOM 兜底链路测试."""

    model_id = "oom"
    display_name = "OOM"
    estimated_vram_mb = 0
    device = "cpu"

    def __init__(self) -> None:
        self.unload_called = False

    def load(self) -> None:
        pass

    def unload(self) -> None:
        self.unload_called = True

    def predict(self, image: Image.Image) -> np.ndarray:
        raise ModelOOMError("synthetic OOM during predict")


class TrackingAdapter:
    """记录 load/unload 调用次数, predict 返回零矩阵."""

    def __init__(self, name: str) -> None:
        self.model_id = name
        self.display_name = name
        self.estimated_vram_mb = 0
        self.device = "cpu"
        self.loaded = False
        self.load_count = 0

    def load(self) -> None:
        self.loaded = True
        self.load_count += 1

    def unload(self) -> None:
        self.loaded = False

    def predict(self, image: Image.Image) -> np.ndarray:
        h, w = image.size[1], image.size[0]
        return np.zeros((h, w), dtype=np.float32)


# 让 _helpers.py 在 model_manager 已被 import 后再加载, 防止循环
_ = depth_service  # silence unused-import linter (we re-export via test files)
