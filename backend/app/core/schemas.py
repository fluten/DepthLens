"""Pydantic v2 schemas — 前后端 API 契约.

约定:
- 所有 API 请求 / 响应都通过 Pydantic 模型校验
- ``DepthResult.depth_b64`` 是 float32 数组的 base64 (值域 [0,1], shape HxW)
  前端 ``atob()`` → ``Float32Array.from(...)`` → 在 Canvas/WebGL 上做 colormap
- 字段命名一律 ``snake_case``, 与 Python 风格一致; 前端 TS 类型一一对齐
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Pydantic v2 默认保留 ``model_`` 前缀作为内部命名空间, 与本项目的 ``model_id``
# 字段冲突. 在所有用到 ``model_id`` 的 schema 上设置 ``protected_namespaces=()``,
# 取消该限制. 这是用户明文授权的修改 (Issue #5).
_ALLOW_MODEL_PREFIX = ConfigDict(protected_namespaces=())


# ── 基础类型 ────────────────────────────────────────────────

ModelStatusLiteral = Literal["idle", "loading", "ready", "error"]
DeviceLiteral = Literal["cpu", "cuda"]


# ── 通用错误响应 ─────────────────────────────────────────────


class ErrorResponse(BaseModel):
    """全局异常处理器序列化的统一错误结构."""

    error: str = Field(..., description="异常类名,例如 ModelOOMError")
    message: str = Field(..., description="面向用户的中文提示")


# ── 健康/系统 ───────────────────────────────────────────────


class HealthResponse(BaseModel):
    """``GET /api/health``."""

    status: Literal["ok"] = "ok"
    device: DeviceLiteral
    models_loaded: list[str] = Field(default_factory=list, description="当前已加载的 model_id")


class SystemInfo(BaseModel):
    """``GET /api/system/info`` — 硬件 / 运行时信息."""

    gpu_name: str | None = None
    gpu_vram_mb: int | None = None
    gpu_vram_used_mb: int | None = None
    cpu: str
    ram_mb: int
    cuda_available: bool
    torch_version: str


# ── 模型 ───────────────────────────────────────────────────


class ModelInfo(BaseModel):
    """模型注册表中一个模型的元信息."""

    id: str = Field(..., description="唯一 model_id, 例如 depth-anything-v2-small")
    name: str = Field(..., description="人类可读名称")
    size: Literal["small", "base", "large"]
    estimated_vram_mb: int = Field(..., description="估计显存占用 (FP32)")
    loaded: bool = False


class ModelLoadRequest(BaseModel):
    """``POST /api/models/load``."""

    model_config = _ALLOW_MODEL_PREFIX

    model_id: str


class ModelLoadResponse(BaseModel):
    """``POST /api/models/load`` 响应."""

    model_config = _ALLOW_MODEL_PREFIX

    status: ModelStatusLiteral
    model_id: str
    device: DeviceLiteral
    load_time_ms: float
    vram_used_mb: int | None = None


class ModelUnloadResponse(BaseModel):
    """``POST /api/models/unload`` 响应."""

    status: Literal["ok"] = "ok"


# ── 深度推理 ────────────────────────────────────────────────


class DepthStats(BaseModel):
    """深度图统计 (后端归一化后的 [0,1] 区间)."""

    min: float
    max: float
    mean: float
    median: float


class DepthResult(BaseModel):
    """``POST /api/depth/image`` 响应.

    ``depth_b64``: float32 数组的 base64. 解码后形状为 ``(height, width)``,
    值域 ``[0, 1]``. 数据顺序为 row-major (C order). 前端使用
    ``new Float32Array(buffer)`` 构造.
    """

    model_config = _ALLOW_MODEL_PREFIX

    depth_b64: str = Field(..., description="float32 深度图的 base64")
    width: int
    height: int
    inference_ms: float
    stats: DepthStats
    model_id: str
    device: DeviceLiteral
