"""DepthService — 图片深度推理编排.

职责:
    bytes (multipart) → 预处理 → 模型推理 → 后处理 → :class:`DepthResult`

设计:
    - 不直接持有模型: 通过注入的 :class:`ModelManager` 拿当前模型
    - 不知道是哪个模型: 走 :class:`DepthEstimator` Protocol
    - 不做协议解析: Router 已把 multipart 拆成 bytes 再交进来
    - 错误一律抛业务异常 (DepthLensError 子类), 由 main.py 全局 handler 统一序列化
    - 输入约束: ``MAX_IMAGE_BYTES`` (50MB) 上传上限, 超出抛 :class:`ImageTooLargeError`

不要在这里:
    - 调用 ``Image.open`` (用 ``core.image_utils.prepare_image``)
    - 归一化深度 (用 ``core.depth_utils.postprocess``)
    - 处理 HTTP 状态码 (在 router / 全局 handler 层)
"""

from __future__ import annotations

import time

from ..config import MAX_IMAGE_BYTES, MAX_IMAGE_DIM
from ..core.depth_utils import postprocess
from ..core.exceptions import ImageTooLargeError, ModelOOMError
from ..core.image_utils import prepare_image
from ..core.schemas import DepthResult
from .model_manager import ModelManager


class DepthService:
    """图片单帧深度推理编排器.

    用法:
        >>> service = DepthService(get_model_manager())
        >>> result = service.estimate_image(image_bytes)  # → DepthResult
    """

    def __init__(self, model_manager: ModelManager) -> None:
        self._mm = model_manager

    def estimate_image(
        self,
        image_bytes: bytes,
        *,
        invert_depth: bool = False,
    ) -> DepthResult:
        """完整推理管线: bytes → DepthResult.

        Args:
            image_bytes: HTTP multipart 上传的原始字节
            invert_depth: 是否反转深度方向 (用户偏好, 默认 False)

        Returns:
            填充好的 :class:`DepthResult` Pydantic 模型, router 直接返回.

        Raises:
            ImageTooLargeError: 字节数超过 :data:`config.MAX_IMAGE_BYTES`
            InvalidImageError: 数据不是有效图像 (含空 bytes, 由 image_utils 抛)
            UnsupportedFormatError: 格式不在白名单 (gif/svg/...)
            ModelNotLoadedError: 当前没有加载模型
            ModelOOMError: 推理时显存不足 (已自动卸载)
        """
        # 1) 上传体积兜底 (router 层 FastAPI 默认不限制 multipart 体积).
        #    "空 bytes" 不在这里检查 — 由 core.image_utils.decode_image 统一抛
        #    InvalidImageError, 避免多层重复校验.
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise ImageTooLargeError(
                f"上传 {len(image_bytes)} 字节, 超过上限 {MAX_IMAGE_BYTES}"
            )

        # 2) 取当前模型 (未加载会抛 ModelNotLoadedError)
        model = self._mm.get_current()

        # 3) 预处理 — Core 层纯函数 (decode → exif → rgb → resize).
        #    decode_image 内部会对空 bytes 抛 InvalidImageError("空文件").
        image = prepare_image(image_bytes, max_dim=MAX_IMAGE_DIM)

        # 4) 推理 — adapter, 唯一会触碰 GPU 的步骤
        t0 = time.perf_counter()
        try:
            raw_depth = model.predict(image)
        except ModelOOMError as exc:
            # 推理 OOM: 让 ModelManager 走兜底 unload 流程, 然后重抛
            raise self._mm.handle_inference_oom(exc)
        inference_ms = (time.perf_counter() - t0) * 1000.0

        # 5) 后处理 — Core 层纯函数 (normalize → stats → b64)
        depth_b64, width, height, stats = postprocess(
            raw_depth, invert_depth=invert_depth
        )

        # 6) 装填响应模型
        return DepthResult(
            depth_b64=depth_b64,
            width=width,
            height=height,
            inference_ms=inference_ms,
            stats=stats,
            model_id=self._mm.current_id or "",
            device=self._mm.device,  # type: ignore[arg-type]
        )


# ── 模块级单例 (与 ModelManager 同模式) ───────────────────────


_instance: DepthService | None = None


def get_depth_service() -> DepthService:
    """FastAPI dependency: 返回全局唯一的 DepthService."""
    global _instance
    if _instance is None:
        from .model_manager import get_model_manager  # 避免循环导入

        _instance = DepthService(get_model_manager())
    return _instance


def reset_depth_service_for_tests() -> None:
    """仅供测试使用: 重置模块级单例."""
    global _instance
    _instance = None
