"""DepthEstimator Protocol — 所有模型适配器必须实现的统一接口.

这是 Adapter 层和 Service 层之间的契约. 它使得 ``DepthService`` 完全不知道
当前用的是 Depth Anything 还是 MiDaS, 也不关心模型来自 HuggingFace 还是
本地权重 — 任何实现了本 Protocol 的对象都可以被 ``ModelManager`` 管理.

新增模型 (例如未来的 Depth Anything V3) 的步骤:
    1. 在 ``adapters/`` 下新建一个文件, 实现本 Protocol
    2. 在 ``config.MODEL_REGISTRY`` 中注册其元信息
    3. 在 ``ModelManager._build`` 工厂中加一个分支
不需要改动任何 ``services/`` 或 ``routers/`` 代码.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np
from PIL import Image


@runtime_checkable
class DepthEstimator(Protocol):
    """单目深度估计模型的统一接口.

    实现要求:

    Attributes:
        model_id: 唯一字符串 id, 与 :data:`config.MODEL_REGISTRY` 的 key 一致.
            前端通过这个 id 请求加载/卸载.
        display_name: 人类可读名称, 用于 UI 显示和日志.
        estimated_vram_mb: 预估 FP32 推理显存占用 (MB). 用于 OOM 预防检查.

    Methods:
        load: 下载/加载权重到目标 device. 幂等 — 重复调用应直接返回.
        unload: 释放权重和显存. 幂等. 卸载后再次 :meth:`predict` 必须 raise.
        predict: 单张图片推理.

            **输入约定**: PIL ``Image.Image``, mode 已是 ``RGB``, 朝向已修正,
            尺寸已控制在 :data:`config.MAX_IMAGE_DIM` 以内.
            (这些预处理由 :mod:`core.image_utils` 完成, adapter 不重复做)

            **输出约定**: ``np.ndarray``, ``dtype=float32``, ``shape=(H, W)``,
            值域 *任意* (相对逆深度, 通常是几十到几千的浮点). **不要在 adapter 内
            归一化** — 归一化和 stats 计算由 :func:`core.depth_utils.postprocess`
            统一处理, 这样所有模型走同一条后处理管线.

            ``H`` 和 ``W`` 应等于输入图像的尺寸 (adapter 内部若做了 patch /
            resize, 必须把结果 resize 回原尺寸).
    """

    model_id: str
    display_name: str
    estimated_vram_mb: int

    def load(self) -> None: ...

    def unload(self) -> None: ...

    def predict(self, image: Image.Image) -> np.ndarray: ...
