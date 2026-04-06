"""全局配置常量 — 单一真相来源 (single source of truth).

设计原则:
- 不引入 ``pydantic-settings`` 等环境变量驱动框架, 本地工具不需要
- 所有 "魔法数字" 集中在此文件, 业务代码 import 而非内联
- 模型注册表也在这里, 这样 ModelManager 不需要硬编码 model_id
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# ── 服务端口 ────────────────────────────────────────────────

HOST: str = "127.0.0.1"
PORT: int = 8000

# 前端 Vite dev server. 生产部署时若同源则可改为空列表 (FastAPI 不下发 CORS 头)
CORS_ORIGINS: list[str] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# ── 输入限制 (与 SPEC §13.4 / §13.5 对齐) ──────────────────

MAX_IMAGE_DIM: int = 4096            # 长边 (像素), 超出后端兜底缩放
MAX_IMAGE_BYTES: int = 50 * 1024 * 1024   # 50MB 上传上限
MAX_VIDEO_BYTES: int = 500 * 1024 * 1024  # 500MB
MAX_VIDEO_SECONDS: int = 5 * 60      # 5 分钟

# ── 路径 ────────────────────────────────────────────────────

# 本文件位于 backend/app/config.py
APP_DIR: Path = Path(__file__).resolve().parent       # backend/app/
BACKEND_DIR: Path = APP_DIR.parent                    # backend/

# 临时文件目录 (与 SPEC §11 文件结构一致, 位于 backend/app/tmp/)
TMP_DIR: Path = APP_DIR / "tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)

# 临时文件清理阈值: 启动时清理超过 24h 的文件 (SPEC §13.5)
TMP_FILE_TTL_SECONDS: int = 24 * 3600


# ── 模型注册表 ─────────────────────────────────────────────


@dataclass(frozen=True)
class ModelEntry:
    """模型注册表中一个条目, 与 schemas.ModelInfo 对齐."""

    id: str                    # 唯一 model_id (前端传入)
    name: str                  # 人类可读名称
    size: str                  # "small" | "base" | "large"
    hf_repo: str               # HuggingFace 仓库 id
    estimated_vram_mb: int     # FP32 估计显存占用


# Depth Anything V2 三档. HuggingFace repo 来自官方:
# https://huggingface.co/depth-anything
MODEL_REGISTRY: dict[str, ModelEntry] = {
    "depth-anything-v2-small": ModelEntry(
        id="depth-anything-v2-small",
        name="Depth Anything V2 · Small",
        size="small",
        hf_repo="depth-anything/Depth-Anything-V2-Small-hf",
        estimated_vram_mb=400,
    ),
    "depth-anything-v2-base": ModelEntry(
        id="depth-anything-v2-base",
        name="Depth Anything V2 · Base",
        size="base",
        hf_repo="depth-anything/Depth-Anything-V2-Base-hf",
        estimated_vram_mb=900,
    ),
    "depth-anything-v2-large": ModelEntry(
        id="depth-anything-v2-large",
        name="Depth Anything V2 · Large",
        size="large",
        hf_repo="depth-anything/Depth-Anything-V2-Large-hf",
        estimated_vram_mb=1600,
    ),
}

DEFAULT_MODEL_ID: str = "depth-anything-v2-small"


# ── 推理默认值 ──────────────────────────────────────────────

# OOM 兜底: 加载前若可用显存低于此阈值则拒绝并提示降级
VRAM_SAFETY_MARGIN_MB: int = 256
