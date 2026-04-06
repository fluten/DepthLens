"""深度图后处理纯函数 — 归一化、统计、序列化.

设计原则:
- **纯函数**: 输入 numpy 数组 → 输出 numpy / 标量 / 字符串. 无状态, 无 I/O.
- **不依赖 torch**: 仅使用 numpy. 模型在 adapter 层把 tensor 转 ndarray 后交给本层.
- 上层 service 调用 :func:`postprocess` 一步到位拿到可序列化的 :class:`DepthResult`
  字段集合 (depth_b64 + stats + 形状).

深度数据约定 (与 SPEC §6.3 / schemas.DepthResult 对齐):
- ``dtype = float32``
- ``shape = (H, W)``  row-major
- ``value ∈ [0, 1]``  其中 0 = 最近, 1 = 最远 (后续 colormap 映射在前端进行)
"""

from __future__ import annotations

import base64

import numpy as np

from .schemas import DepthStats


def normalize(depth: np.ndarray) -> np.ndarray:
    """将任意范围的深度数组线性归一化到 ``[0, 1]`` (float32).

    Depth Anything / MiDaS 等模型输出的是 *相对深度* (relative inverse depth),
    数值范围依赖输入图像的内容和模型尺度. 必须做 min-max 归一化才能在前端用
    colormap LUT 渲染.

    边界:
    - 全相同值 (max == min): 返回全 0, 避免除零
    - NaN: 替换为 0
    - +Inf / -Inf: 用 *有限部分* 的 max/min 替换, 防止 ``hi - lo`` 在
      float32 上溢出 (float32 max ≈ 3.4e38, 直接相减得 inf)
    """
    arr = np.asarray(depth, dtype=np.float32).copy()
    # 1) NaN → 0
    nan_mask = np.isnan(arr)
    if nan_mask.any():
        arr[nan_mask] = 0.0
    # 2) Inf → 有限部分的 min/max (而非 dtype 的 min/max)
    finite_mask = np.isfinite(arr)
    if not finite_mask.all():
        if finite_mask.any():
            finite_lo = float(arr[finite_mask].min())
            finite_hi = float(arr[finite_mask].max())
        else:
            finite_lo = finite_hi = 0.0
        arr[arr == np.inf] = finite_hi
        arr[arr == -np.inf] = finite_lo

    lo = float(arr.min())
    hi = float(arr.max())
    if hi - lo < 1e-12:
        # 全平面同一深度: 返回 0 矩阵 (前端会显示纯色, 至少不会报错)
        return np.zeros_like(arr, dtype=np.float32)

    return ((arr - lo) / (hi - lo)).astype(np.float32, copy=False)


def invert(depth: np.ndarray) -> np.ndarray:
    """反转深度方向 (1 - depth).

    用于用户偏好 "近黑远亮" 与 "近亮远黑" 切换. 输入必须已归一化.
    """
    return (1.0 - np.asarray(depth, dtype=np.float32)).astype(np.float32, copy=False)


def compute_stats(depth: np.ndarray) -> DepthStats:
    """计算归一化后深度图的统计信息 — min/max/mean/median.

    用于 HUD 显示和导出元数据. 返回值经过 ``float()`` 转换以保证 JSON 可序列化
    (避免 numpy 标量序列化时报错).
    """
    arr = np.asarray(depth, dtype=np.float32)
    return DepthStats(
        min=float(arr.min()),
        max=float(arr.max()),
        mean=float(arr.mean()),
        median=float(np.median(arr)),
    )


def encode_float32_b64(depth: np.ndarray) -> str:
    """将 float32 数组按 row-major 顺序编码为 base64 字符串.

    前端解码:
        ``const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;``
        ``const f32 = new Float32Array(buf);``

    保证:
    - dtype 强制 float32 (即使输入是 float64 也会向下转换)
    - 内存布局连续 (``ascontiguousarray``), 否则 ``tobytes()`` 不保证顺序
    """
    arr = np.ascontiguousarray(depth, dtype=np.float32)
    return base64.b64encode(arr.tobytes()).decode("ascii")


def postprocess(
    raw_depth: np.ndarray,
    *,
    invert_depth: bool = False,
) -> tuple[str, int, int, DepthStats]:
    """深度图完整后处理管线.

    Args:
        raw_depth: 模型原始输出, 任意值域的 2D 数组
        invert_depth: 是否反转深度方向 (用户偏好)

    Returns:
        ``(depth_b64, width, height, stats)`` —— 直接喂给
        :class:`schemas.DepthResult` 的字段元组.

    Raises:
        ValueError: 输入不是 2D 数组 (颜色通道未压缩)
    """
    arr = np.asarray(raw_depth)
    if arr.ndim != 2:
        raise ValueError(
            f"depth_utils.postprocess 期望 2D 数组, 收到 shape={arr.shape}"
        )

    normalized = normalize(arr)
    if invert_depth:
        normalized = invert(normalized)

    height, width = normalized.shape
    stats = compute_stats(normalized)
    depth_b64 = encode_float32_b64(normalized)
    return depth_b64, int(width), int(height), stats
