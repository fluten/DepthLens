/**
 * colormaps.ts 单元测试
 *
 * 验证:
 * - LUT 格式正确 (256 槽 × 4 通道)
 * - 端点对齐 anchor stops
 * - 单调连续 (相邻槽差不大, 防止有 anchor 写错引入色阶跳变)
 * - getColormapLUT 缓存
 * - 7 个 colormap 全部可生成
 */
import { describe, it, expect } from 'vitest'
import {
  buildColormapLUT,
  getColormapLUT,
  __COLORMAP_STOPS_FOR_TESTS,
  type ColormapStop,
} from '../colormaps'
import { COLORMAP_IDS, type ColormapId } from '../constants'

describe('buildColormapLUT — 输出格式', () => {
  const stops: ColormapStop[] = [
    { pos: 0, rgb: [0, 0, 0] },
    { pos: 1, rgb: [255, 255, 255] },
  ]

  it('返回 Uint8Array(256*4)', () => {
    const lut = buildColormapLUT(stops)
    expect(lut).toBeInstanceOf(Uint8Array)
    expect(lut.length).toBe(256 * 4)
  })

  it('alpha 通道全部 = 255', () => {
    const lut = buildColormapLUT(stops)
    for (let i = 0; i < 256; i++) {
      expect(lut[i * 4 + 3]).toBe(255)
    }
  })

  it('端点对齐 stops', () => {
    const lut = buildColormapLUT(stops)
    // i=0 → stops[0] = (0,0,0)
    expect(lut[0]).toBe(0)
    expect(lut[1]).toBe(0)
    expect(lut[2]).toBe(0)
    // i=255 → stops[1] = (255,255,255)
    expect(lut[255 * 4]).toBe(255)
    expect(lut[255 * 4 + 1]).toBe(255)
    expect(lut[255 * 4 + 2]).toBe(255)
  })

  it('线性插值: 中点 ≈ (128,128,128)', () => {
    const lut = buildColormapLUT(stops)
    const mid = 128
    // ±1 容差 (round)
    expect(Math.abs(lut[mid * 4]! - 128)).toBeLessThanOrEqual(1)
    expect(Math.abs(lut[mid * 4 + 1]! - 128)).toBeLessThanOrEqual(1)
    expect(Math.abs(lut[mid * 4 + 2]! - 128)).toBeLessThanOrEqual(1)
  })

  it('< 2 stops 抛错', () => {
    expect(() => buildColormapLUT([])).toThrow()
    expect(() => buildColormapLUT([{ pos: 0, rgb: [0, 0, 0] }])).toThrow()
  })

  it('多 stop 区间正确路由', () => {
    const stops3: ColormapStop[] = [
      { pos: 0, rgb: [0, 0, 0] },
      { pos: 0.5, rgb: [255, 0, 0] },
      { pos: 1, rgb: [0, 0, 255] },
    ]
    const lut = buildColormapLUT(stops3)
    // i=128 ≈ pos 0.502 — 落在第二段, 接近 stops[1]
    expect(lut[128 * 4]).toBeGreaterThan(200) // 红色仍然主导
    // i=255 → stops[2] = 蓝
    expect(lut[255 * 4]).toBe(0)
    expect(lut[255 * 4 + 2]).toBe(255)
  })
})

describe('COLORMAP_STOPS — 数据完整性', () => {
  it.each([...COLORMAP_IDS])('"%s" 至少 2 个 stop', (id) => {
    const stops = __COLORMAP_STOPS_FOR_TESTS[id as ColormapId]
    expect(stops.length).toBeGreaterThanOrEqual(2)
  })

  it.each([...COLORMAP_IDS])('"%s" 第一个 stop pos === 0', (id) => {
    const stops = __COLORMAP_STOPS_FOR_TESTS[id as ColormapId]
    expect(stops[0]!.pos).toBe(0)
  })

  it.each([...COLORMAP_IDS])('"%s" 最后一个 stop pos === 1', (id) => {
    const stops = __COLORMAP_STOPS_FOR_TESTS[id as ColormapId]
    expect(stops[stops.length - 1]!.pos).toBe(1)
  })

  it.each([...COLORMAP_IDS])('"%s" 所有 stop pos 严格递增', (id) => {
    const stops = __COLORMAP_STOPS_FOR_TESTS[id as ColormapId]
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]!.pos).toBeGreaterThan(stops[i - 1]!.pos)
    }
  })

  it.each([...COLORMAP_IDS])('"%s" RGB 各分量 ∈ [0,255]', (id) => {
    const stops = __COLORMAP_STOPS_FOR_TESTS[id as ColormapId]
    for (const s of stops) {
      for (const c of s.rgb) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(255)
      }
    }
  })
})

describe('getColormapLUT — 公共 API', () => {
  it.each([...COLORMAP_IDS])('"%s" 返回 1024 字节 LUT', (id) => {
    const lut = getColormapLUT(id as ColormapId)
    expect(lut.length).toBe(1024)
  })

  it('多次调用同一 id 返回同一引用 (缓存)', () => {
    const a = getColormapLUT('inferno')
    const b = getColormapLUT('inferno')
    expect(a).toBe(b) // 引用相等
  })

  it('不同 id 返回不同 LUT', () => {
    const a = getColormapLUT('inferno')
    const b = getColormapLUT('viridis')
    expect(a).not.toBe(b)
    // 至少有一个像素不一样
    let differs = false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        differs = true
        break
      }
    }
    expect(differs).toBe(true)
  })
})

describe('LUT 平滑度 — 防止 anchor 写错', () => {
  it.each([...COLORMAP_IDS])('"%s" 相邻槽差 < 60 (无明显跳变)', (id) => {
    const lut = getColormapLUT(id as ColormapId)
    let maxDelta = 0
    for (let i = 1; i < 256; i++) {
      const dr = Math.abs(lut[i * 4]! - lut[(i - 1) * 4]!)
      const dg = Math.abs(lut[i * 4 + 1]! - lut[(i - 1) * 4 + 1]!)
      const db = Math.abs(lut[i * 4 + 2]! - lut[(i - 1) * 4 + 2]!)
      maxDelta = Math.max(maxDelta, dr, dg, db)
    }
    // 8-stop 线性插值的相邻槽最大 delta 约为 (max_anchor_delta) / 32 ≈ 8.
    // 给 60 的非常宽松上限只是为了抓"我把 0 写成了 200"这类粗心错误.
    expect(maxDelta).toBeLessThan(60)
  })
})
