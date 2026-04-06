"""Router: 模型注册表 / 加载 / 卸载.

端点:
    GET  /api/models          → list[ModelInfo]
    POST /api/models/load     ← {model_id}     → ModelLoadResponse
    POST /api/models/unload                    → ModelUnloadResponse

约定:
    - 不在这里写业务逻辑, 全部委托给 :class:`ModelManager`
    - 异常 *不* 在这里捕获, 全部交给 main.py 注册的 ``DepthLensError``
      全局 handler 统一序列化为 ``{error, message}``
    - Pydantic 模型在 :mod:`core.schemas` 中定义, 不重复
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..core.schemas import (
    ModelInfo,
    ModelLoadRequest,
    ModelLoadResponse,
    ModelUnloadResponse,
)
from ..services.model_manager import ModelManager, get_model_manager

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=list[ModelInfo], summary="列出全部可用模型")
def list_models(
    mm: ModelManager = Depends(get_model_manager),
) -> list[ModelInfo]:
    """返回注册表中所有模型 + 当前是否已加载.

    前端 ``ModelSelector`` 用此接口渲染 Small/Base/Large 三档.
    """
    raw = mm.list_models()
    return [ModelInfo(**item) for item in raw]


@router.post(
    "/load",
    response_model=ModelLoadResponse,
    summary="加载指定模型",
)
def load_model(
    req: ModelLoadRequest,
    mm: ModelManager = Depends(get_model_manager),
) -> ModelLoadResponse:
    """按 ``model_id`` 加载模型.

    若已加载相同模型, 是幂等的 (秒回当前状态).
    若加载其他模型, 会先卸载当前再加载新模型.

    可能的错误:
        - 404 ModelNotFoundError: model_id 不在注册表
        - 502 ModelLoadError: 网络/HuggingFace/权重失败
        - 507 ModelOOMError: 显存不足 (加载前预检或加载时 OOM)
    """
    snapshot = mm.load(req.model_id)
    return ModelLoadResponse(**snapshot)


@router.post(
    "/unload",
    response_model=ModelUnloadResponse,
    summary="卸载当前模型",
)
def unload_model(
    mm: ModelManager = Depends(get_model_manager),
) -> ModelUnloadResponse:
    """卸载当前已加载的模型, 释放显存. 幂等."""
    mm.unload()
    return ModelUnloadResponse()
