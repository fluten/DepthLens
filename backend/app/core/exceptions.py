"""统一异常层级.

所有自定义异常继承 DepthLensError. main.py 中注册全局异常处理器, 序列化为
``{"error": <ClassName>, "message": <user_message>}``, 前端 Toast 直接显示
``user_message``.

设计原则:
- ``status_code``: HTTP 状态码 (FastAPI Response 用)
- ``user_message``: 面向终端用户的中文文案 (前端 Toast 显示)
- 内部技术细节通过 ``detail`` (可选) 暴露给日志, 不直接给用户
"""

from __future__ import annotations


class DepthLensError(Exception):
    """所有 DepthLens 自定义异常的基类."""

    status_code: int = 500
    user_message: str = "内部错误"

    def __init__(self, detail: str | None = None) -> None:
        # detail 用于服务端日志/调试, user_message 用于前端展示
        self.detail = detail
        super().__init__(detail or self.user_message)


# ── 模型相关 ────────────────────────────────────────────────


class ModelNotLoadedError(DepthLensError):
    """请求推理时尚未加载任何模型."""

    status_code = 400
    user_message = "请先加载模型"


class ModelNotFoundError(DepthLensError):
    """请求加载的 model_id 未在注册表中."""

    status_code = 404
    user_message = "未知的模型 ID"


class ModelLoadError(DepthLensError):
    """模型权重下载或初始化失败 (网络 / HuggingFace 不可达 / 损坏)."""

    status_code = 502
    user_message = "模型加载失败"


class ModelOOMError(DepthLensError):
    """CUDA 显存不足. 由 ModelManager 兜底捕获 torch.cuda.OutOfMemoryError 抛出."""

    status_code = 507
    user_message = "显存不足,模型已释放"


# ── 输入相关 ────────────────────────────────────────────────


class UnsupportedFormatError(DepthLensError):
    """文件格式不在白名单中 (jpg/png/webp/bmp/tiff)."""

    status_code = 415
    user_message = "不支持的文件格式"


class InvalidImageError(DepthLensError):
    """图像数据无法解码 (损坏 / 非图像内容)."""

    status_code = 400
    user_message = "图像无法解析"


class ImageTooLargeError(DepthLensError):
    """图像超出尺寸/体积上限."""

    status_code = 413
    user_message = "图像过大"


class VideoTooLargeError(DepthLensError):
    """视频超过 500MB / 5 分钟上限."""

    status_code = 413
    user_message = "视频过大"
