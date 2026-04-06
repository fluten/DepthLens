"""Router: 单帧图片深度推理.

端点:
    POST /api/depth/image      ← multipart(image=<file>)  → DepthResult

约定:
    - 仅做 multipart 解析, 把字节流交给 :class:`DepthService`
    - 不在这里写预处理 / 模型调用 / 后处理
    - ``invert_depth`` 通过 query 参数传 (前端 ViewportStore.invertDepth)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Query, UploadFile

from ..core.schemas import DepthResult
from ..services.depth_service import DepthService, get_depth_service

router = APIRouter(prefix="/api/depth", tags=["depth"])


@router.post(
    "/image",
    response_model=DepthResult,
    summary="单张图片深度推理",
)
async def estimate_image(
    image: UploadFile = File(..., description="待推理图片"),
    invert_depth: bool = Query(False, description="是否反转深度方向"),
    service: DepthService = Depends(get_depth_service),
) -> DepthResult:
    """接收 multipart 上传的图片, 返回归一化深度图 (float32 base64).

    可能的错误:
        - 400 InvalidImageError: 图像无法解析或为空 (含空 bytes)
        - 413 ImageTooLargeError: 体积超过 50MB
        - 415 UnsupportedFormatError: 格式不在白名单
        - 400 ModelNotLoadedError: 没有加载任何模型
        - 507 ModelOOMError: 推理时显存不足 (已自动卸载)
    """
    data = await image.read()
    return service.estimate_image(data, invert_depth=invert_depth)
