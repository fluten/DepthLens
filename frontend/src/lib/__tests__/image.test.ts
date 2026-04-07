/**
 * image.ts 单元测试
 *
 * 范围:
 * - computeResizeDimensions: 纯函数, 完整覆盖
 * - shouldReencode: 纯函数, 完整覆盖
 * - preprocessImage: 依赖 createImageBitmap (happy-dom 不实现), 此层只做
 *   "导出存在 + 类型正确" 的烟雾测试. 真实集成验证留到 Phase 2 浏览器
 *   端集成测试.
 */
import { describe, it, expect } from 'vitest'
import {
  computeResizeDimensions,
  preprocessImage,
  shouldReencode,
} from '../image'
import {
  COMPRESS_IMAGE_BYTES,
  MAX_IMAGE_DIM,
} from '../constants'

// ── computeResizeDimensions ────────────────────────────────────────────────

describe('computeResizeDimensions', () => {
  it('小于上限不缩放', () => {
    const r = computeResizeDimensions(1920, 1080, 4096)
    expect(r).toEqual({ width: 1920, height: 1080, resized: false })
  })

  it('正好等于上限不缩放', () => {
    const r = computeResizeDimensions(4096, 2048, 4096)
    expect(r).toEqual({ width: 4096, height: 2048, resized: false })
  })

  it('横向超限按长边缩放', () => {
    const r = computeResizeDimensions(8000, 4000, 4096)
    // scale = 4096/8000 = 0.512 → 4096 x 2048
    expect(r.width).toBe(4096)
    expect(r.height).toBe(2048)
    expect(r.resized).toBe(true)
  })

  it('纵向超限按长边缩放', () => {
    const r = computeResizeDimensions(3000, 6000, 4096)
    // scale = 4096/6000 ≈ 0.6827 → 2048 x 4096
    expect(r.width).toBe(2048)
    expect(r.height).toBe(4096)
    expect(r.resized).toBe(true)
  })

  it('正方形超限', () => {
    const r = computeResizeDimensions(8192, 8192, 4096)
    expect(r.width).toBe(4096)
    expect(r.height).toBe(4096)
  })

  it('保持长宽比 (允许 1px 取整误差)', () => {
    const r = computeResizeDimensions(6500, 4000, 4096)
    const origRatio = 6500 / 4000
    const newRatio = r.width / r.height
    expect(Math.abs(newRatio - origRatio)).toBeLessThan(0.01)
  })

  it('1px 不会被缩成 0', () => {
    const r = computeResizeDimensions(10000, 1, 100)
    expect(r.width).toBe(100)
    expect(r.height).toBeGreaterThanOrEqual(1) // round 后是 0, max(1,0)=1
  })

  it('width 或 height ≤ 0 抛 RangeError', () => {
    expect(() => computeResizeDimensions(0, 100, 4096)).toThrow(RangeError)
    expect(() => computeResizeDimensions(100, 0, 4096)).toThrow(RangeError)
    expect(() => computeResizeDimensions(-1, 100, 4096)).toThrow(RangeError)
  })

  it('maxDim ≤ 0 抛 RangeError', () => {
    expect(() => computeResizeDimensions(100, 100, 0)).toThrow(RangeError)
    expect(() => computeResizeDimensions(100, 100, -50)).toThrow(RangeError)
  })

  it('SPEC §13.4 用例: 8000x6000 → 4096x3072', () => {
    const r = computeResizeDimensions(8000, 6000, MAX_IMAGE_DIM)
    expect(r.width).toBe(4096)
    expect(r.height).toBe(3072) // round(6000 * 4096/8000) = 3072
  })
})

// ── shouldReencode ─────────────────────────────────────────────────────────

describe('shouldReencode', () => {
  it('完全在限制内 → false', () => {
    expect(shouldReencode(1920, 1080, 1024 * 1024)).toBe(false)
  })

  it('长边超限 → true', () => {
    expect(shouldReencode(5000, 1000, 1024)).toBe(true)
  })

  it('文件超阈值 → true', () => {
    expect(shouldReencode(1920, 1080, COMPRESS_IMAGE_BYTES + 1)).toBe(true)
  })

  it('两者都超 → true', () => {
    expect(shouldReencode(5000, 5000, COMPRESS_IMAGE_BYTES + 1)).toBe(true)
  })

  it('正好等于尺寸阈值 → false', () => {
    expect(shouldReencode(MAX_IMAGE_DIM, 100, 1024)).toBe(false)
  })

  it('正好等于大小阈值 → false', () => {
    expect(shouldReencode(100, 100, COMPRESS_IMAGE_BYTES)).toBe(false)
  })

  it('支持自定义阈值', () => {
    expect(shouldReencode(100, 100, 1024, 50, 999999)).toBe(true) // 100 > 50
    expect(shouldReencode(100, 100, 2048, 999, 1024)).toBe(true) // 2048 > 1024
  })
})

// ── preprocessImage (烟雾测试) ─────────────────────────────────────────────

describe('preprocessImage — 烟雾测试', () => {
  it('导出函数', () => {
    expect(typeof preprocessImage).toBe('function')
  })

  it('返回 Promise', () => {
    // happy-dom 实现了 createImageBitmap stub, 返回 ImageBitmap-like, 用空文件
    // 调用即可验证函数能进入 then/catch 分支 (不验证图像内容).
    const file = new File([new Uint8Array(8)], 'test.jpg', { type: 'image/jpeg' })
    const result = preprocessImage(file)
    expect(result).toBeInstanceOf(Promise)
    // 不 await 结果 — happy-dom 的 createImageBitmap 行为不稳定, 可能 reject.
    // 我们用 .catch 吞掉以避免 unhandled rejection 污染测试输出.
    result.catch(() => undefined)
  })
})
