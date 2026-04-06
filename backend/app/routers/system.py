"""Router: 健康检查 / 系统硬件信息.

端点:
    GET /api/health         → HealthResponse
    GET /api/system/info    → SystemInfo

约定:
    - ``health`` 是高频心跳 (前端每 5s 轮询), 必须毫秒返回, 不查 GPU
    - ``system/info`` 较慢, 仅在 SettingsSheet 打开时调用
    - 探测硬件用 ``psutil`` (CPU/RAM) + 延迟导入 ``torch`` (GPU)
"""

from __future__ import annotations

import platform
from typing import Any

from fastapi import APIRouter, Depends

from ..core.schemas import HealthResponse, SystemInfo
from ..services.model_manager import ModelManager, get_model_manager

router = APIRouter(prefix="/api", tags=["system"])


# ── /api/health ───────────────────────────────────────────────


@router.get("/health", response_model=HealthResponse, summary="健康检查")
def health(
    mm: ModelManager = Depends(get_model_manager),
) -> HealthResponse:
    """轻量心跳, 前端每 5s 轮询. 不应触发 GPU 查询."""
    return HealthResponse(
        status="ok",
        device=mm.device,  # type: ignore[arg-type]
        models_loaded=[mm.current_id] if mm.current_id else [],
    )


# ── /api/system/info ──────────────────────────────────────────


def _query_torch_info() -> dict[str, Any]:
    """延迟导入 torch, 返回 ``{cuda_available, gpu_name, gpu_vram_mb, ..., torch_version}``.

    没装 torch 时返回最小信息 (cuda_available=False, torch_version='not-installed').
    """
    try:
        import torch  # noqa: PLC0415
    except ImportError:
        return {
            "cuda_available": False,
            "gpu_name": None,
            "gpu_vram_mb": None,
            "gpu_vram_used_mb": None,
            "torch_version": "not-installed",
        }

    info: dict[str, Any] = {
        "cuda_available": bool(torch.cuda.is_available()),
        "torch_version": str(torch.__version__),
        "gpu_name": None,
        "gpu_vram_mb": None,
        "gpu_vram_used_mb": None,
    }
    if torch.cuda.is_available():
        try:
            info["gpu_name"] = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            info["gpu_vram_mb"] = int(props.total_memory // (1024 * 1024))
            info["gpu_vram_used_mb"] = int(
                torch.cuda.memory_allocated() // (1024 * 1024)
            )
        except Exception:  # noqa: BLE001 — GPU 探测失败不应导致 500
            pass
    return info


def _query_cpu_ram() -> tuple[str, int]:
    """返回 ``(cpu_name, ram_total_mb)``. 优先用 psutil, 否则降级到 platform."""
    cpu_name = platform.processor() or platform.machine() or "unknown"
    ram_mb = 0
    try:
        import psutil  # noqa: PLC0415

        ram_mb = int(psutil.virtual_memory().total // (1024 * 1024))
    except ImportError:
        pass
    return cpu_name, ram_mb


@router.get("/system/info", response_model=SystemInfo, summary="系统硬件信息")
def system_info() -> SystemInfo:
    """完整硬件 + 运行时信息. 给 SettingsSheet 的 "关于" 区块用."""
    cpu, ram_mb = _query_cpu_ram()
    torch_info = _query_torch_info()
    return SystemInfo(
        gpu_name=torch_info["gpu_name"],
        gpu_vram_mb=torch_info["gpu_vram_mb"],
        gpu_vram_used_mb=torch_info["gpu_vram_used_mb"],
        cpu=cpu,
        ram_mb=ram_mb,
        cuda_available=torch_info["cuda_available"],
        torch_version=torch_info["torch_version"],
    )
