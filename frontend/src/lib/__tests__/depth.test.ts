/**
 * depth.ts 单元测试
 *
 * 覆盖:
 * - decodeDepthBase64: 与后端 encode_float32_b64 反向兼容
 * - computeStats: 与后端 depth_utils.compute_stats 算法等价
 * - invertDepth: 1 - x 公式 + 不修改输入
 * - applyColormap: 形状 / 通道 / range / invert / 边界 clamp / 错误参数
 */
import { describe, it, expect } from 'vitest'
import { applyColormap, computeStats, decodeDepthBase64 } from '../depth'
import { getColormapLUT } from '../colormaps'

// ── 工具 ────────────────────────────────────────────────────────────────────

/** 把 Float32Array 编码为 base64 (模拟后端编码) */
function encodeFloat32B64(arr: Float32Array): string {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
  let binary = ''
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]!)
  return btoa(binary)
}

// ── decodeDepthBase64 ──────────────────────────────────────────────────────

describe('decodeDepthBase64', () => {
  it('正确反向编码 (round-trip)', () => {
    const orig = new Float32Array([0.0, 0.25, 0.5, 0.75, 1.0])
    const b64 = encodeFloat32B64(orig)
    const dec = decodeDepthBase64(b64)
    expect(dec.length).toBe(orig.length)
    for (let i = 0; i < orig.length; i++) {
      // float32 是精确编码 (位拷贝), 不存在精度损失
      expect(dec[i]).toBe(orig[i])
    }
  })

  it('空数据返回长度 0', () => {
    expect(decodeDepthBase64('').length).toBe(0)
  })

  it('字节长度不是 4 的倍数 → 抛错', () => {
    // "AAA" 解码后是 2 字节, 不是 4 的倍数
    expect(() => decodeDepthBase64('AAA')).toThrow(/4 的倍数/)
  })

  it('大数组 round-trip (1024 元素)', () => {
    const orig = new Float32Array(1024)
    for (let i = 0; i < 1024; i++) orig[i] = i / 1024
    const dec = decodeDepthBase64(encodeFloat32B64(orig))
    expect(dec.length).toBe(1024)
    for (let i = 0; i < 1024; i++) expect(dec[i]).toBe(orig[i])
  })
})

// ── computeStats ───────────────────────────────────────────────────────────

describe('computeStats', () => {
  it('单元素数组', () => {
    const r = computeStats(new Float32Array([0.42]))
    // Float32Array 存储 0.42 会有 ~1e-7 的精度损失, 用 closeTo 而非严格 ===
    expect(r.min).toBeCloseTo(0.42, 6)
    expect(r.max).toBeCloseTo(0.42, 6)
    expect(r.mean).toBeCloseTo(0.42, 6)
    expect(r.median).toBeCloseTo(0.42, 6)
  })

  it('已知值集 [0, 0.25, 0.5, 0.75, 1.0]', () => {
    const r = computeStats(new Float32Array([0, 0.25, 0.5, 0.75, 1.0]))
    expect(r.min).toBe(0)
    expect(r.max).toBe(1)
    expect(r.mean).toBeCloseTo(0.5, 6)
    expect(r.median).toBe(0.5)
  })

  it('偶数长度 — 中位数取中间两个的均值', () => {
    const r = computeStats(new Float32Array([1, 2, 3, 4]))
    expect(r.median).toBe(2.5)
  })

  it('未排序输入也正确', () => {
    const r = computeStats(new Float32Array([0.9, 0.1, 0.5, 0.7, 0.3]))
    expect(r.min).toBeCloseTo(0.1, 6)
    expect(r.max).toBeCloseTo(0.9, 6)
    expect(r.median).toBeCloseTo(0.5, 6)
    expect(r.mean).toBeCloseTo(0.5, 6)
  })

  it('空数组返回全 0 (与后端边界一致)', () => {
    const r = computeStats(new Float32Array(0))
    expect(r).toEqual({ min: 0, max: 0, mean: 0, median: 0 })
  })

  it('全相同值', () => {
    const r = computeStats(new Float32Array([0.7, 0.7, 0.7, 0.7]))
    expect(r.min).toBeCloseTo(0.7, 6)
    expect(r.max).toBeCloseTo(0.7, 6)
    expect(r.mean).toBeCloseTo(0.7, 6)
    expect(r.median).toBeCloseTo(0.7, 6)
    // 不变性: min === max === mean === median (在 float32 内部精度下)
    expect(r.min).toBe(r.max)
    expect(r.min).toBe(r.median)
  })

  // ── NaN / Infinity 防御 (与后端 numpy.nan* 系列行为一致) ───────────────
  it('包含 NaN: NaN 元素被忽略, 其余正常统计', () => {
    const r = computeStats(new Float32Array([0.2, NaN, 0.6, 0.8]))
    expect(r.min).toBeCloseTo(0.2, 6)
    expect(r.max).toBeCloseTo(0.8, 6)
    expect(r.mean).toBeCloseTo((0.2 + 0.6 + 0.8) / 3, 6)
    // 中位数也跳过 NaN: 在 [0.2, 0.6, 0.8] 三元素中是 0.6
    expect(r.median).toBeCloseTo(0.6, 6)
  })

  it('包含 +Infinity: 同样被跳过', () => {
    const r = computeStats(new Float32Array([0.3, Infinity, 0.7]))
    expect(r.min).toBeCloseTo(0.3, 6)
    expect(r.max).toBeCloseTo(0.7, 6)
    expect(r.mean).toBeCloseTo(0.5, 6)
  })

  it('包含 -Infinity: 同样被跳过', () => {
    const r = computeStats(new Float32Array([-Infinity, 0.4, 0.6]))
    expect(r.min).toBeCloseTo(0.4, 6)
    expect(r.max).toBeCloseTo(0.6, 6)
  })

  it('全部 NaN: 返回全 0 (空集占位)', () => {
    const r = computeStats(new Float32Array([NaN, NaN, NaN]))
    expect(r).toEqual({ min: 0, max: 0, mean: 0, median: 0 })
  })

  it('NaN + 偶数个有限值: 中位数取剩余有限值的中间', () => {
    // 有限值 [0.1, 0.3, 0.7, 0.9] 偶数 → median = (0.3+0.7)/2 = 0.5
    const r = computeStats(new Float32Array([NaN, 0.1, 0.3, 0.7, 0.9]))
    expect(r.median).toBeCloseTo(0.5, 6)
  })
})

// 注: invertDepth 测试随着函数本体一并延后到 Phase 2 viewport 任务

// ── applyColormap ──────────────────────────────────────────────────────────

describe('applyColormap', () => {
  const lut = getColormapLUT('inferno')

  it('返回 ImageData 形状正确', () => {
    const depth = new Float32Array(2 * 3) // 2x3
    const img = applyColormap(depth, 2, 3, lut)
    expect(img.width).toBe(2)
    expect(img.height).toBe(3)
    expect(img.data.length).toBe(2 * 3 * 4)
  })

  it('alpha 通道全部 = 255', () => {
    const depth = new Float32Array([0, 0.5, 1, 0.25])
    const img = applyColormap(depth, 4, 1, lut)
    for (let i = 0; i < 4; i++) {
      expect(img.data[i * 4 + 3]).toBe(255)
    }
  })

  it('depth=0 → LUT[0]', () => {
    const depth = new Float32Array([0])
    const img = applyColormap(depth, 1, 1, lut)
    expect(img.data[0]).toBe(lut[0])
    expect(img.data[1]).toBe(lut[1])
    expect(img.data[2]).toBe(lut[2])
  })

  it('depth=1 → LUT[255]', () => {
    const depth = new Float32Array([1])
    const img = applyColormap(depth, 1, 1, lut)
    expect(img.data[0]).toBe(lut[255 * 4])
    expect(img.data[1]).toBe(lut[255 * 4 + 1])
    expect(img.data[2]).toBe(lut[255 * 4 + 2])
  })

  it('值越界自动 clamp ([-1, 2] → [0, 1])', () => {
    const depth = new Float32Array([-1, 0.5, 2])
    const img = applyColormap(depth, 3, 1, lut)
    // 第 0 个像素 clamp 到 0 → LUT[0]
    expect(img.data[0]).toBe(lut[0])
    // 第 2 个像素 clamp 到 1 → LUT[255]
    expect(img.data[8]).toBe(lut[255 * 4])
  })

  // ── NaN / Infinity 防御 ────────────────────────────────────────────────
  it('NaN 视为 0 → 映射到 LUT[0]', () => {
    const depth = new Float32Array([NaN])
    const img = applyColormap(depth, 1, 1, lut)
    expect(img.data[0]).toBe(lut[0])
    expect(img.data[1]).toBe(lut[1])
    expect(img.data[2]).toBe(lut[2])
    expect(img.data[3]).toBe(255)
  })

  it('+Infinity 视为 0 → 映射到 LUT[0]', () => {
    const depth = new Float32Array([Infinity])
    const img = applyColormap(depth, 1, 1, lut)
    expect(img.data[0]).toBe(lut[0])
  })

  it('-Infinity 视为 0 → 映射到 LUT[0]', () => {
    const depth = new Float32Array([-Infinity])
    const img = applyColormap(depth, 1, 1, lut)
    expect(img.data[0]).toBe(lut[0])
  })

  it('NaN 混在正常像素里不传染', () => {
    const depth = new Float32Array([0, NaN, 1])
    const img = applyColormap(depth, 3, 1, lut)
    expect(img.data[0]).toBe(lut[0]) // 0 → LUT[0]
    expect(img.data[4]).toBe(lut[0]) // NaN → LUT[0]
    expect(img.data[8]).toBe(lut[255 * 4]) // 1 → LUT[255]
  })

  // 注: invert 选项 / range 裁剪 等用户偏好功能延后到 Phase 2 viewport 任务

  it('shape 不匹配抛 RangeError', () => {
    const depth = new Float32Array(5)
    expect(() => applyColormap(depth, 2, 3, lut)).toThrow(RangeError)
  })

  it('LUT 长度不对抛 RangeError', () => {
    const depth = new Float32Array(1)
    const badLut = new Uint8Array(100)
    expect(() => applyColormap(depth, 1, 1, badLut)).toThrow(RangeError)
  })
})
