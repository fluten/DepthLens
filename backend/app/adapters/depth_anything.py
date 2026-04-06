"""Depth Anything V2 适配器 (HuggingFace Transformers).

该 adapter 通过 ``transformers.AutoModelForDepthEstimation`` 加载 Depth Anything V2
的 Small / Base / Large 三档变体. 模型权重在首次 load 时从 HuggingFace 自动下载,
后续走 HF 缓存 (``~/.cache/huggingface``).

注意:
- ``torch`` / ``transformers`` 是重型依赖, 仅在 :meth:`load` 时按需 import,
  这样在仅做单元测试 ``core/`` 纯函数时不会被 PyTorch import 卡住.
- 模型输出是 *相对逆深度* (relative inverse depth), 数值范围依赖输入. 本 adapter
  **不** 做归一化, 由 :func:`core.depth_utils.postprocess` 统一处理.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import numpy as np
from PIL import Image

from ..core.exceptions import ModelLoadError, ModelOOMError

if TYPE_CHECKING:  # pragma: no cover — 类型提示用, 运行时按需导入
    import torch


class DepthAnythingV2Adapter:
    """实现 :class:`base.DepthEstimator` Protocol 的 Depth Anything V2 包装器."""

    def __init__(
        self,
        *,
        model_id: str,
        display_name: str,
        hf_repo: str,
        estimated_vram_mb: int,
    ) -> None:
        # 公开属性 (Protocol 字段)
        self.model_id: str = model_id
        self.display_name: str = display_name
        self.estimated_vram_mb: int = estimated_vram_mb

        # 私有: 仅 load 后非空
        self._hf_repo: str = hf_repo
        self._processor: Any | None = None
        self._model: Any | None = None
        self._device: str = "cpu"  # load 时根据可用性更新
        self._torch: Any | None = None  # 缓存导入的 torch 模块

    # ── 生命周期 ────────────────────────────────────────────

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def device(self) -> str:
        return self._device

    def load(self) -> None:
        """加载权重到目标 device. 幂等."""
        if self.is_loaded:
            return

        try:
            import torch  # 重型依赖, 延迟导入
            from transformers import (  # type: ignore[import-untyped]
                AutoImageProcessor,
                AutoModelForDepthEstimation,
            )
        except ImportError as exc:
            raise ModelLoadError(
                f"缺少依赖 (torch/transformers): {exc}"
            ) from exc

        self._torch = torch
        self._device = "cuda" if torch.cuda.is_available() else "cpu"

        try:
            # ``use_fast=True`` 使用 Rust 后端 processor, 避免慢的 Python 实现
            self._processor = AutoImageProcessor.from_pretrained(
                self._hf_repo, use_fast=True
            )
            model = AutoModelForDepthEstimation.from_pretrained(self._hf_repo)
            model = model.to(self._device)
            model.eval()
            self._model = model
        except torch.cuda.OutOfMemoryError as exc:  # pragma: no cover — 难复现
            self._cleanup_partial_load()
            raise ModelOOMError(f"加载时显存不足: {exc}") from exc
        except Exception as exc:  # noqa: BLE001 — HF 抛的异常种类太多, 统一封装
            self._cleanup_partial_load()
            raise ModelLoadError(
                f"加载 {self._hf_repo} 失败: {exc}"
            ) from exc

    def unload(self) -> None:
        """释放权重和显存. 幂等."""
        if not self.is_loaded:
            return

        # 显式 del 让 GC 立即回收, 然后清空 CUDA cache
        self._model = None
        self._processor = None

        torch = self._torch
        if torch is not None and torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()

    def _cleanup_partial_load(self) -> None:
        """load 失败时确保部分加载的资源被释放."""
        self._model = None
        self._processor = None
        torch = self._torch
        if torch is not None and torch.cuda.is_available():
            torch.cuda.empty_cache()

    # ── 推理 ────────────────────────────────────────────────

    def predict(self, image: Image.Image) -> np.ndarray:
        """对单张 PIL 图像做深度推理.

        Returns:
            ``np.ndarray``, ``dtype=float32``, ``shape=(H, W)``, 值域任意.
            ``H``, ``W`` 与输入 image 一致 (内部已 resize 回原尺寸).
        """
        if not self.is_loaded or self._model is None or self._processor is None:
            # 上层 ModelManager 应保证调用前已加载, 这里是兜底防御
            raise ModelLoadError("Depth Anything 模型未加载")

        torch = self._torch
        assert torch is not None  # is_loaded 已蕴含

        try:
            inputs = self._processor(images=image, return_tensors="pt")
            inputs = {k: v.to(self._device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self._model(**inputs)
                # outputs.predicted_depth: shape (B, H', W'), 模型内部尺寸
                predicted = outputs.predicted_depth

            # 插值回原图尺寸. PIL.Image.size = (W, H), 而 interpolate 期望 (H, W)
            target_h, target_w = image.size[1], image.size[0]
            resized = torch.nn.functional.interpolate(
                predicted.unsqueeze(1),  # (B, 1, H', W')
                size=(target_h, target_w),
                mode="bicubic",
                align_corners=False,
            ).squeeze()  # → (H, W)

            depth = resized.detach().cpu().numpy().astype(np.float32, copy=False)
            return depth

        except torch.cuda.OutOfMemoryError as exc:
            # 推理时 OOM: 释放显存, 让 ModelManager 走 unload 流程
            torch.cuda.empty_cache()
            raise ModelOOMError(f"推理显存不足: {exc}") from exc


# ── 工厂函数 ────────────────────────────────────────────────


def build_depth_anything_v2(entry: Any) -> DepthAnythingV2Adapter:
    """根据 ``config.ModelEntry`` 构造 adapter 实例.

    用 ``Any`` 而非具体类型, 避免 adapters 层反向依赖 config (架构上 adapter 是
    更底层). ModelManager 持有 ModelEntry, 把它传进来即可.
    """
    return DepthAnythingV2Adapter(
        model_id=entry.id,
        display_name=entry.name,
        hf_repo=entry.hf_repo,
        estimated_vram_mb=entry.estimated_vram_mb,
    )
