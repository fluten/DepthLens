"""depth_utils.py 单元测试 — 覆盖归一化 / 反转 / stats / b64 / 全管线 + 边界."""

from __future__ import annotations

import base64
import sys
from pathlib import Path

import numpy as np

# 把 backend/ 加到 sys.path, 让 ``from app.core...`` 可用
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core import depth_utils  # noqa: E402
from app.core.schemas import DepthStats  # noqa: E402


# ── normalize ───────────────────────────────────────────────


def test_normalize_basic_range():
    """普通正值数组归一化到 [0, 1]."""
    arr = np.array([[10.0, 20.0], [30.0, 40.0]], dtype=np.float32)
    out = depth_utils.normalize(arr)
    assert out.dtype == np.float32
    assert out.shape == (2, 2)
    assert out.min() == 0.0
    assert out.max() == 1.0
    # 线性映射: 10→0, 40→1, 中间值线性
    assert np.allclose(out, [[0.0, 1 / 3], [2 / 3, 1.0]], atol=1e-6)


def test_normalize_negative_values():
    """负值也应被映射 (相对深度可能是负数)."""
    arr = np.array([[-5.0, 0.0, 5.0]], dtype=np.float32)
    out = depth_utils.normalize(arr)
    assert out.min() == 0.0
    assert out.max() == 1.0
    assert np.isclose(out[0, 1], 0.5)


def test_normalize_constant_array_no_division_by_zero():
    """全相同值不应除零, 应返回全 0."""
    arr = np.full((3, 3), 7.0, dtype=np.float32)
    out = depth_utils.normalize(arr)
    assert np.all(out == 0.0)
    assert out.shape == (3, 3)


def test_normalize_handles_nan():
    """NaN 应被替换为 0, 不污染输出."""
    arr = np.array([[1.0, np.nan, 3.0], [np.nan, 2.0, np.nan]], dtype=np.float32)
    out = depth_utils.normalize(arr)
    assert not np.isnan(out).any()
    assert out.min() == 0.0
    assert out.max() == 1.0


def test_normalize_handles_inf():
    """+Inf / -Inf 应被替换, 不污染输出."""
    arr = np.array([[1.0, np.inf, 3.0], [-np.inf, 2.0, 5.0]], dtype=np.float32)
    out = depth_utils.normalize(arr)
    assert not np.isnan(out).any()
    assert not np.isinf(out).any()
    assert out.min() == 0.0
    assert out.max() == 1.0


def test_normalize_accepts_list_input():
    """asarray 转换: 接受 list 而非只是 ndarray."""
    out = depth_utils.normalize([[0.0, 100.0], [50.0, 25.0]])
    assert out.dtype == np.float32
    assert out.min() == 0.0
    assert out.max() == 1.0


# ── invert ──────────────────────────────────────────────────


def test_invert_basic():
    arr = np.array([[0.0, 0.25, 0.5, 0.75, 1.0]], dtype=np.float32)
    out = depth_utils.invert(arr)
    assert np.allclose(out, [[1.0, 0.75, 0.5, 0.25, 0.0]])
    assert out.dtype == np.float32


# ── compute_stats ──────────────────────────────────────────


def test_compute_stats_returns_DepthStats():
    arr = np.array([[0.0, 0.5, 1.0]], dtype=np.float32)
    s = depth_utils.compute_stats(arr)
    assert isinstance(s, DepthStats)
    assert s.min == 0.0
    assert s.max == 1.0
    assert np.isclose(s.mean, 0.5)
    assert np.isclose(s.median, 0.5)


def test_compute_stats_python_floats_not_numpy_scalars():
    """JSON 序列化要求是 Python float, 不能是 np.float32 标量."""
    arr = np.array([[0.1, 0.2, 0.3]], dtype=np.float32)
    s = depth_utils.compute_stats(arr)
    assert type(s.min) is float
    assert type(s.max) is float
    assert type(s.mean) is float
    assert type(s.median) is float


# ── encode_float32_b64 ─────────────────────────────────────


def test_encode_b64_roundtrip():
    """编码后能解码回完全相同的 float32 数组."""
    arr = np.array([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]], dtype=np.float32)
    b64 = depth_utils.encode_float32_b64(arr)
    decoded_bytes = base64.b64decode(b64)
    restored = np.frombuffer(decoded_bytes, dtype=np.float32).reshape(arr.shape)
    assert np.array_equal(restored, arr)


def test_encode_b64_forces_float32():
    """float64 输入应自动降级为 float32."""
    arr = np.array([[1.0, 2.0]], dtype=np.float64)
    b64 = depth_utils.encode_float32_b64(arr)
    decoded = np.frombuffer(base64.b64decode(b64), dtype=np.float32)
    assert decoded.dtype == np.float32
    assert len(decoded) == 2


def test_encode_b64_handles_non_contiguous():
    """非连续数组 (transpose 后) 也应正确编码."""
    arr = np.arange(12, dtype=np.float32).reshape(3, 4).T  # 非连续
    assert not arr.flags["C_CONTIGUOUS"]
    b64 = depth_utils.encode_float32_b64(arr)
    decoded = np.frombuffer(base64.b64decode(b64), dtype=np.float32).reshape(arr.shape)
    assert np.array_equal(decoded, arr)


# ── postprocess (full pipeline) ────────────────────────────


def test_postprocess_full_pipeline():
    raw = np.array([[10.0, 20.0, 30.0], [40.0, 50.0, 60.0]], dtype=np.float32)
    b64, w, h, stats = depth_utils.postprocess(raw)
    # shape
    assert w == 3
    assert h == 2
    # b64 解码后形状 / 值域正确
    decoded = np.frombuffer(base64.b64decode(b64), dtype=np.float32).reshape(h, w)
    assert decoded.min() == 0.0
    assert decoded.max() == 1.0
    # stats 是归一化后的
    assert isinstance(stats, DepthStats)
    assert stats.min == 0.0
    assert stats.max == 1.0


def test_postprocess_with_invert():
    raw = np.array([[10.0, 20.0], [30.0, 40.0]], dtype=np.float32)
    b64_normal, *_ = depth_utils.postprocess(raw, invert_depth=False)
    b64_inv, *_ = depth_utils.postprocess(raw, invert_depth=True)
    normal = np.frombuffer(base64.b64decode(b64_normal), dtype=np.float32)
    inverted = np.frombuffer(base64.b64decode(b64_inv), dtype=np.float32)
    assert np.allclose(normal + inverted, 1.0)


def test_postprocess_rejects_3d_input():
    """模型输出必须是 2D, 防止把 (1, H, W) 或 (H, W, 3) 传进来."""
    bad = np.zeros((1, 4, 4), dtype=np.float32)
    try:
        depth_utils.postprocess(bad)
    except ValueError as e:
        assert "2D" in str(e)
    else:
        raise AssertionError("应抛 ValueError")


def test_postprocess_constant_input_does_not_crash():
    """全平面同深度 (退化场景) 应返回全 0 而不是 NaN."""
    raw = np.full((4, 4), 3.14, dtype=np.float32)
    b64, w, h, stats = depth_utils.postprocess(raw)
    decoded = np.frombuffer(base64.b64decode(b64), dtype=np.float32)
    assert np.all(decoded == 0.0)
    assert stats.min == 0.0
    assert stats.max == 0.0


def test_postprocess_dimensions_match_input():
    """输出 width/height 必须等于输入 shape."""
    raw = np.random.rand(60, 80).astype(np.float32)
    b64, w, h, _ = depth_utils.postprocess(raw)
    assert w == 80
    assert h == 60
    decoded = np.frombuffer(base64.b64decode(b64), dtype=np.float32)
    assert decoded.size == 60 * 80


# ── 主入口: pytest 不可用时直接跑 ───────────────────────────

if __name__ == "__main__":
    import inspect

    failed = 0
    passed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn) and inspect.isfunction(fn):
            try:
                fn()
                passed += 1
                print(f"  PASS  {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"  FAIL  {name}: {type(e).__name__}: {e}")
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
