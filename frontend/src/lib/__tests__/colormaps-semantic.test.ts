/**
 * colormaps-semantic.test.ts — 语义校准测试
 *
 * 与 colormaps.test.ts 的"形式正确性"测试不同, 本文件验证 7 个 colormap
 * 的 LUT 输出与 matplotlib v3.x 真值的 RGB 接近度.
 *
 * 容忍度: ±15 RGB 单位 (每通道独立).
 * 这个值的来源:
 * - 我们用 9 个 anchor + 线性插值近似 matplotlib 的 256 槽光滑函数
 * - 在 anchor 位置 (i=0/64/128/191/255 对应 t=0/.25/.5/.75/1) 偏差应 < 5
 * - 在 anchor 之间最差也应 < 15
 * - 大于 15 通常意味着 anchor 写错了 (例如颜色通道弄反 / 数值打错)
 *
 * 失败示例: 如果有人把 inferno 的 0.5 处写成 (84, 188, 55) (R/G 互换),
 * 这个测试会立刻报错; 而 colormaps.test.ts 的形式正确性测试不会发现.
 */
import { describe, it, expect } from 'vitest'
import { getColormapLUT } from '../colormaps'
import type { ColormapId } from '../constants'

const TOLERANCE = 15

/**
 * matplotlib 真值参考表.
 * 每个 colormap 在 LUT 索引 [0, 64, 128, 191, 255] 处的实际 RGB.
 *
 * 数据来源: matplotlib v3.x _cm_listed.py / _cm.py 的 LUT 256 槽数据,
 * 在采样索引位置的真实输出.
 */
const REFERENCE: Record<ColormapId, ReadonlyArray<[number, [number, number, number]]>> = {
  inferno: [
    [0, [0, 0, 4]],
    [64, [87, 16, 110]],
    [128, [188, 55, 84]],
    [191, [250, 158, 8]],
    [255, [252, 255, 164]],
  ],
  plasma: [
    [0, [13, 8, 135]],
    [64, [126, 3, 168]],
    [128, [204, 71, 120]],
    [191, [248, 149, 64]],
    [255, [240, 249, 33]],
  ],
  magma: [
    [0, [0, 0, 4]],
    [64, [81, 18, 124]],
    [128, [183, 55, 121]],
    [191, [252, 137, 97]],
    [255, [252, 253, 191]],
  ],
  turbo: [
    [0, [48, 18, 59]],
    [64, [45, 158, 244]],
    [128, [94, 246, 117]],
    [191, [255, 187, 33]],
    [255, [122, 4, 3]],
  ],
  viridis: [
    [0, [68, 1, 84]],
    [64, [61, 75, 138]],
    [128, [33, 144, 141]],
    [191, [94, 201, 97]],
    [255, [253, 231, 37]],
  ],
  bone: [
    [0, [0, 0, 0]],
    [64, [55, 55, 78]],
    [128, [87, 117, 117]],
    [191, [140, 172, 172]],
    [255, [255, 255, 255]],
  ],
  cividis: [
    [0, [0, 32, 76]],
    [64, [44, 75, 110]],
    [128, [101, 110, 124]],
    [191, [160, 154, 117]],
    [255, [255, 234, 70]],
  ],
}

describe('colormap 语义校准 — 与 matplotlib v3.x 对比', () => {
  // 把每个 colormap 的每个采样点都变成一个 it 用例 (35 个 = 7 × 5)
  for (const [colormapIdRaw, samples] of Object.entries(REFERENCE)) {
    const colormapId = colormapIdRaw as ColormapId
    const lut = getColormapLUT(colormapId)

    for (const [idx, expectedRgb] of samples) {
      const [eR, eG, eB] = expectedRgb
      it(`${colormapId} @ LUT[${idx}] ≈ (${eR},${eG},${eB}) ±${TOLERANCE}`, () => {
        const off = idx * 4
        const actual = [lut[off]!, lut[off + 1]!, lut[off + 2]!] as const
        const [aR, aG, aB] = actual

        // 给出可读的失败信息: "actual=(...) expected=(...)"
        const msg = `actual=(${aR},${aG},${aB}) expected=(${eR},${eG},${eB})`

        expect(Math.abs(aR - eR), `R 通道偏差过大: ${msg}`).toBeLessThanOrEqual(
          TOLERANCE
        )
        expect(Math.abs(aG - eG), `G 通道偏差过大: ${msg}`).toBeLessThanOrEqual(
          TOLERANCE
        )
        expect(Math.abs(aB - eB), `B 通道偏差过大: ${msg}`).toBeLessThanOrEqual(
          TOLERANCE
        )
      })
    }
  }

  // 端点严格匹配 — 容忍度收紧到 ±2 (端点是最容易写对的, 不严抓没意义)
  describe('端点严格 (容忍度 ±2)', () => {
    for (const [colormapIdRaw, samples] of Object.entries(REFERENCE)) {
      const colormapId = colormapIdRaw as ColormapId
      const lut = getColormapLUT(colormapId)

      for (const [idx, expectedRgb] of [samples[0]!, samples[samples.length - 1]!]) {
        const [eR, eG, eB] = expectedRgb
        it(`${colormapId} 端点 [${idx}] === (${eR},${eG},${eB})`, () => {
          const off = idx * 4
          expect(Math.abs(lut[off]! - eR)).toBeLessThanOrEqual(2)
          expect(Math.abs(lut[off + 1]! - eG)).toBeLessThanOrEqual(2)
          expect(Math.abs(lut[off + 2]! - eB)).toBeLessThanOrEqual(2)
        })
      }
    }
  })
})
