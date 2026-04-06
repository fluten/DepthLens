"""ModelManager — 模型生命周期单例.

职责:
    - 维护当前已加载的 ``DepthEstimator`` (一次只持有一个, 单例)
    - 通过 ``config.MODEL_REGISTRY`` 按 ``model_id`` 实例化 adapter
    - 加载前检查可用显存, 不足则拒绝并抛 :class:`ModelOOMError`
    - 加载/推理 OOM 兜底: ``unload()`` 释放 → 抛 :class:`ModelOOMError`
      让上层 Toast 提示用户切换到更小的模型
    - 卸载后再次切换是支持的 (用户在前端切档)

设计原则:
    - **单例**: 模块级 ``_instance`` + ``get_model_manager()`` 工厂.
      FastAPI 启动时创建一次, 所有 router 通过依赖注入复用同一份.
    - **不持有 torch**: 本模块不 import torch, 由 adapter 负责. 这样
      纯单元测试 (不装 torch) 也能验证 register/load/unload 流程的状态机.
    - **状态机最小化**: idle → loading → ready → idle (unload) / error
"""

from __future__ import annotations

import threading
import time
from typing import Any

from ..adapters.base import DepthEstimator
from ..config import MODEL_REGISTRY, VRAM_SAFETY_MARGIN_MB, ModelEntry
from ..core.exceptions import (
    DepthLensError,
    ModelLoadError,
    ModelNotFoundError,
    ModelNotLoadedError,
    ModelOOMError,
)
from ..core.schemas import ModelStatusLiteral
from ._adapter_registry import ADAPTER_FACTORIES, _factory_for  # noqa: F401


# ── ModelManager ──────────────────────────────────────────────


class ModelManager:
    """单例: 管理当前加载的深度估计模型.

    线程安全: 内部使用 ``threading.Lock`` 串行 load/unload, 防止前端在加载
    过程中点了第二个模型导致状态错乱. ``get_current()`` 不加锁 (热路径).
    """

    def __init__(self) -> None:
        self._current: DepthEstimator | None = None
        self._current_id: str | None = None
        self._status: ModelStatusLiteral = "idle"
        self._lock = threading.Lock()
        self._last_load_time_ms: float = 0.0

    # ── 状态查询 ────────────────────────────────────────────

    @property
    def status(self) -> ModelStatusLiteral:
        return self._status

    @property
    def current_id(self) -> str | None:
        return self._current_id

    @property
    def device(self) -> str:
        """当前模型所在 device, 未加载时返回 cpu (前端 health 用)."""
        if self._current is None:
            return "cpu"
        # adapter 暴露 device 属性 (DepthAnythingV2Adapter 有), 不是 Protocol
        # 强制要求, 所以用 getattr 兜底
        return getattr(self._current, "device", "cpu")

    @property
    def last_load_time_ms(self) -> float:
        return self._last_load_time_ms

    def get_current(self) -> DepthEstimator:
        """返回当前模型, 未加载时抛 :class:`ModelNotLoadedError`."""
        if self._current is None:
            raise ModelNotLoadedError("调用 get_current 时尚未加载任何模型")
        return self._current

    def list_models(self) -> list[dict[str, Any]]:
        """返回注册表中所有模型的元信息 + 加载状态.

        给 ``GET /api/models`` 用. 形状与 :class:`schemas.ModelInfo` 对齐:
        ``{id, name, size, estimated_vram_mb, loaded}``.
        """
        return [
            {
                "id": entry.id,
                "name": entry.name,
                "size": entry.size,
                "estimated_vram_mb": entry.estimated_vram_mb,
                "loaded": entry.id == self._current_id,
            }
            for entry in MODEL_REGISTRY.values()
        ]

    # ── 生命周期 ────────────────────────────────────────────

    def load(self, model_id: str) -> dict[str, Any]:
        """加载指定 model_id, 若已加载相同模型则直接返回 (幂等).

        切换到不同模型时会先 unload 当前模型, 再 load 新模型.

        Returns:
            ``{status, model_id, device, load_time_ms, vram_used_mb}`` —
            直接喂给 :class:`schemas.ModelLoadResponse`.

        Raises:
            ModelNotFoundError: model_id 不在注册表中
            ModelOOMError: 显存不足 (加载前检查或加载时 OOM)
            ModelLoadError: 其他加载失败 (网络 / HuggingFace / 权重损坏)
        """
        with self._lock:
            # 1) 校验 model_id
            entry = MODEL_REGISTRY.get(model_id)
            if entry is None:
                raise ModelNotFoundError(f"model_id={model_id} 不在 MODEL_REGISTRY")

            # 2) 幂等: 同一个模型已加载则直接返回当前状态
            if self._current_id == model_id and self._current is not None:
                return self._snapshot()

            # 3) 切换模型: 先卸载旧的, 释放显存
            if self._current is not None:
                self._unload_current()

            # 4) 显存预检 (CUDA 可用时才检查)
            self._check_vram_or_raise(entry)

            # 5) 实例化并加载
            self._status = "loading"
            t0 = time.perf_counter()
            try:
                factory = _factory_for(entry)
                adapter = factory(entry)
                adapter.load()
            except DepthLensError:
                # 任何业务异常 (ModelOOMError / ModelLoadError / ModelNotFoundError /
                # ...) 原样向上抛, 让全局 handler 用各自的 status_code + user_message
                # 序列化. 不要在这里包装, 否则 ModelNotFoundError (404) 会被错误地
                # 当成 ModelLoadError (502).
                self._status = "error"
                raise
            except Exception as exc:  # noqa: BLE001 — 兜底: 真正未知的运行时异常
                self._status = "error"
                raise ModelLoadError(f"加载 {model_id} 时发生未知错误: {exc}") from exc

            self._current = adapter
            self._current_id = model_id
            self._status = "ready"
            self._last_load_time_ms = (time.perf_counter() - t0) * 1000.0

            return self._snapshot()

    def unload(self) -> None:
        """卸载当前模型. 幂等 — 未加载时是 no-op."""
        with self._lock:
            self._unload_current()

    def _unload_current(self) -> None:
        """内部: 不加锁的 unload (调用方需持锁)."""
        if self._current is None:
            return
        try:
            self._current.unload()
        finally:
            # 即便 adapter.unload() 抛异常, 也强制清空引用让 GC 回收
            self._current = None
            self._current_id = None
            self._status = "idle"
            self._last_load_time_ms = 0.0

    # ── OOM 兜底 (推理路径调用) ────────────────────────────

    def handle_inference_oom(self, exc: ModelOOMError) -> ModelOOMError:
        """推理时 adapter 抛了 ModelOOMError → 自动卸载并返回原异常.

        depth_service 在 except 块里调用本方法, 完成 "OOM → 自动 unload →
        让前端 Toast 显示 user_message" 的兜底链路.
        """
        with self._lock:
            self._unload_current()
            self._status = "error"
        return exc

    # ── 内部辅助 ────────────────────────────────────────────

    def _snapshot(self) -> dict[str, Any]:
        """返回当前状态的 dict, 给 load() 用作响应体."""
        return {
            "status": self._status,
            "model_id": self._current_id or "",
            "device": self.device,
            "load_time_ms": self._last_load_time_ms,
            "vram_used_mb": self._query_vram_used_mb(),
        }

    def _check_vram_or_raise(self, entry: ModelEntry) -> None:
        """加载前显存预检. CUDA 不可用时直接放行 (CPU 模式不查).

        通过延迟导入 torch 避免本模块依赖 torch (单元测试无需装 torch).
        """
        try:
            import torch  # noqa: PLC0415 — 故意延迟导入
        except ImportError:
            # 没装 torch — 走纯单元测试路径, 跳过预检
            return

        if not torch.cuda.is_available():
            return

        try:
            free_bytes, _total = torch.cuda.mem_get_info()
        except Exception:  # noqa: BLE001 — 老版本 torch 没这 API
            return

        free_mb = free_bytes // (1024 * 1024)
        needed_mb = entry.estimated_vram_mb + VRAM_SAFETY_MARGIN_MB
        if free_mb < needed_mb:
            raise ModelOOMError(
                f"可用显存 {free_mb}MB < 需求 {needed_mb}MB "
                f"({entry.name} 估计 {entry.estimated_vram_mb}MB + "
                f"安全余量 {VRAM_SAFETY_MARGIN_MB}MB)"
            )

    def _query_vram_used_mb(self) -> int | None:
        """查询当前进程已分配的 CUDA 显存 (MB), CPU 模式或无 torch 返回 None."""
        try:
            import torch  # noqa: PLC0415
        except ImportError:
            return None
        if not torch.cuda.is_available():
            return None
        try:
            return int(torch.cuda.memory_allocated() // (1024 * 1024))
        except Exception:  # noqa: BLE001
            return None


# ── 模块级单例 ───────────────────────────────────────────────


_instance: ModelManager | None = None
_instance_lock = threading.Lock()


def get_model_manager() -> ModelManager:
    """模块级单例工厂. 首次调用时创建, 之后返回同一实例.

    FastAPI 路由通过 ``Depends(get_model_manager)`` 注入即可拿到全局唯一的
    ModelManager. 避免使用全局变量的 import 副作用 — 测试中可以 monkey-patch
    本函数返回 mock.
    """
    global _instance
    if _instance is None:
        with _instance_lock:
            if _instance is None:
                _instance = ModelManager()
    return _instance


def reset_model_manager_for_tests() -> None:
    """仅供测试使用: 重置模块级单例, 避免测试间状态污染."""
    global _instance
    with _instance_lock:
        if _instance is not None:
            try:
                _instance.unload()
            except Exception:  # noqa: BLE001
                pass
        _instance = None
