"""Adapter 工厂注册表 — model_id → 工厂函数 的查表层.

从 ``model_manager.py`` 抽出, 让 ModelManager 的主逻辑专注状态机, 而不需要
关心 "哪个 adapter 处理哪个 model_id" 这类映射细节.

新增模型 = 在 :data:`ADAPTER_FACTORIES` 中加一行, 不需要改 ``ModelManager``.
Phase 3 加 MiDaS 时会再追加 ``"midas-v3-*"`` 条目.
"""

from __future__ import annotations

from typing import Any

from ..adapters.depth_anything import build_depth_anything_v2
from ..config import ModelEntry
from ..core.exceptions import ModelNotFoundError

# callable: (ModelEntry) -> DepthEstimator. 用 Any 避免反向依赖具体 adapter 类型.
AdapterFactory = Any


ADAPTER_FACTORIES: dict[str, AdapterFactory] = {
    "depth-anything-v2-small": build_depth_anything_v2,
    "depth-anything-v2-base": build_depth_anything_v2,
    "depth-anything-v2-large": build_depth_anything_v2,
}


def _factory_for(entry: ModelEntry) -> AdapterFactory:
    """查表返回 entry 对应的 adapter 工厂.

    Raises:
        ModelNotFoundError: model_id 不在 :data:`ADAPTER_FACTORIES` 中
    """
    factory = ADAPTER_FACTORIES.get(entry.id)
    if factory is None:
        raise ModelNotFoundError(f"未找到 {entry.id} 对应的 adapter 工厂")
    return factory
