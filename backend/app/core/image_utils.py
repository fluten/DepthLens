"""图像预处理纯函数 — 解码、EXIF 修正、等比缩放.

设计原则:
- **纯函数**: 输入 → 输出, 无状态, 无 I/O, 不依赖模型
- 上层 service 调用本模块完成 ``bytes -> PIL.Image (RGB, 朝向修正, 尺寸约束)``
- 仅依赖 Pillow + 标准库, 不引入 torch / numpy
"""

from __future__ import annotations

import io

from PIL import Image, ImageOps

from .exceptions import InvalidImageError, UnsupportedFormatError

# 与 SPEC §13.4 一致的格式白名单
SUPPORTED_FORMATS: frozenset[str] = frozenset(
    {"JPEG", "PNG", "WEBP", "BMP", "TIFF", "MPO"}
)


def decode_image(data: bytes) -> Image.Image:
    """将原始字节流解码为 PIL Image.

    Raises:
        InvalidImageError: 数据无法被 Pillow 识别
        UnsupportedFormatError: 解码成功但格式不在白名单 (gif/svg/...)
    """
    if not data:
        raise InvalidImageError("空文件")
    try:
        img = Image.open(io.BytesIO(data))
        # ``Image.open`` 是惰性的, 通过 ``load()`` 触发实际解码以暴露错误
        img.load()
    except Exception as exc:  # noqa: BLE001 — Pillow 异常类型很多, 统一捕获
        raise InvalidImageError(f"Pillow 解码失败: {exc}") from exc

    fmt = (img.format or "").upper()
    if fmt and fmt not in SUPPORTED_FORMATS:
        raise UnsupportedFormatError(f"不支持的格式: {fmt}")
    return img


def apply_exif_orientation(img: Image.Image) -> Image.Image:
    """根据 EXIF orientation tag 旋转图像至正向显示方向.

    手机拍摄的 JPG 经常带 orientation, 不修正会让模型推理出错位的深度图.
    Pillow 内置 ``ImageOps.exif_transpose`` 已处理所有 8 种 orientation 值.
    """
    return ImageOps.exif_transpose(img) or img


def to_rgb(img: Image.Image) -> Image.Image:
    """将任意 mode (RGBA / L / P / CMYK) 转为 RGB.

    深度模型只接受三通道彩色输入. 透明通道会丢失, 这是预期行为 (深度模型
    不需要 alpha).
    """
    if img.mode == "RGB":
        return img
    if img.mode in ("RGBA", "LA", "P"):
        # P/RGBA 先 convert 到 RGBA 再贴到黑色背景上, 避免透明像素变黑边以外的脏色
        rgba = img.convert("RGBA")
        background = Image.new("RGB", rgba.size, (0, 0, 0))
        background.paste(rgba, mask=rgba.split()[3])
        return background
    return img.convert("RGB")


def resize_to_max_dim(img: Image.Image, max_dim: int) -> tuple[Image.Image, bool]:
    """如果长边超过 ``max_dim`` 则等比缩放, 返回 (新图, 是否被缩放).

    使用 Lanczos 重采样保留细节. 对深度估计任务而言, 长边超过 4096 后边际收益
    很低且推理显存爆炸, 因此先在前端兜底, 后端再保险.
    """
    w, h = img.size
    long_edge = max(w, h)
    if long_edge <= max_dim:
        return img, False
    scale = max_dim / long_edge
    new_size = (max(1, round(w * scale)), max(1, round(h * scale)))
    return img.resize(new_size, Image.Resampling.LANCZOS), True


def prepare_image(data: bytes, max_dim: int) -> Image.Image:
    """完整预处理管线: 字节 → 解码 → EXIF → RGB → 缩放.

    返回 ready-to-infer 的 PIL Image. 这是 service 层唯一应该调用的入口.
    """
    img = decode_image(data)
    img = apply_exif_orientation(img)
    img = to_rgb(img)
    img, _ = resize_to_max_dim(img, max_dim)
    return img
