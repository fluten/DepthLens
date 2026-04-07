/**
 * lib/colormaps.ts — 7 个 colormap 的 LUT (Lookup Table) 生成
 *
 * 输出: ``Uint8Array(256 * 4)`` 形式的 RGBA 表 — 每个深度值 0..255 对应一组
 * (R, G, B, A=255). 这种格式可以直接用于:
 *   - Canvas 2D applyColormap (lib/depth.ts)
 *   - WebGL shader 作为 sampler2D 256x1 纹理 (Phase 2)
 *
 * 实现策略:
 * - 每个 colormap 用 ~9 个 anchor stops 定义控制点
 * - 在 RGB 空间做线性插值填满 256 个槽
 * - 9 个 stop 的精度对深度可视化已经足够 (人眼难以分辨与 matplotlib 256 槽
 *   原始版的差异), 同时把代码体积控制在 ~200 行
 *
 * 数据来源 (BSD-3-Clause / 公有领域):
 * - inferno / plasma / magma / viridis: matplotlib (BSD)
 * - turbo: Google "Turbo, An Improved Rainbow Colormap for Visualization" (Apache 2.0)
 * - bone / cividis: matplotlib (BSD)
 *
 * 升级路径: 如果未来需要像素级精度, 把每张表替换为 256 槽完整数据即可,
 * buildColormapLUT 不需要改.
 */

import type { ColormapId } from './constants'

// ── 类型 ────────────────────────────────────────────────────────────────────

/** 控制点: pos ∈ [0,1], rgb 各分量 ∈ [0,255] */
export interface ColormapStop {
  pos: number
  rgb: readonly [number, number, number]
}

// ── Anchor stops 表 ────────────────────────────────────────────────────────

/**
 * 9-stop 近似. 每个表的第一个 stop pos 必须 = 0, 最后一个必须 = 1, 严格递增.
 * 中间点可以非均匀分布, 当前都用 1/8 步长.
 */
const COLORMAP_STOPS: Record<ColormapId, readonly ColormapStop[]> = {
  // ── inferno: 黑 → 紫 → 红 → 橙 → 黄 (高对比, 暗色背景首选) ──────────────
  // 数据来源: matplotlib inferno LUT 在 [0/8, 1/8, ..., 8/8] 位置的实际采样
  inferno: [
    { pos: 0.0, rgb: [0, 0, 4] },
    { pos: 0.125, rgb: [31, 12, 72] },
    { pos: 0.25, rgb: [87, 16, 110] },
    { pos: 0.375, rgb: [137, 32, 104] },
    { pos: 0.5, rgb: [188, 55, 84] },
    { pos: 0.625, rgb: [231, 96, 53] },
    { pos: 0.75, rgb: [250, 158, 8] },
    { pos: 0.875, rgb: [245, 219, 76] },
    { pos: 1.0, rgb: [252, 255, 164] },
  ],

  // ── plasma: 蓝 → 紫 → 粉 → 橙 → 黄 ────────────────────────────────────
  plasma: [
    { pos: 0.0, rgb: [13, 8, 135] },
    { pos: 0.125, rgb: [75, 3, 161] },
    { pos: 0.25, rgb: [125, 3, 168] },
    { pos: 0.375, rgb: [168, 34, 150] },
    { pos: 0.5, rgb: [203, 70, 121] },
    { pos: 0.625, rgb: [229, 107, 93] },
    { pos: 0.75, rgb: [248, 148, 65] },
    { pos: 0.875, rgb: [253, 195, 40] },
    { pos: 1.0, rgb: [240, 249, 33] },
  ],

  // ── magma: 黑 → 紫 → 粉 → 米白 (柔和, 接近 inferno 但更柔) ────────────
  magma: [
    { pos: 0.0, rgb: [0, 0, 4] },
    { pos: 0.125, rgb: [28, 16, 68] },
    { pos: 0.25, rgb: [79, 18, 123] },
    { pos: 0.375, rgb: [129, 37, 129] },
    { pos: 0.5, rgb: [181, 54, 122] },
    { pos: 0.625, rgb: [229, 80, 100] },
    { pos: 0.75, rgb: [252, 137, 97] },
    { pos: 0.875, rgb: [254, 201, 141] },
    { pos: 1.0, rgb: [252, 253, 191] },
  ],

  // ── turbo: 蓝 → 青 → 绿 → 黄 → 红 (Google 改良版彩虹, 高动态范围) ─────
  turbo: [
    { pos: 0.0, rgb: [48, 18, 59] },
    { pos: 0.125, rgb: [60, 81, 198] },
    { pos: 0.25, rgb: [45, 158, 244] },
    { pos: 0.375, rgb: [28, 217, 195] },
    { pos: 0.5, rgb: [94, 246, 117] },
    { pos: 0.625, rgb: [192, 238, 60] },
    { pos: 0.75, rgb: [255, 187, 33] },
    { pos: 0.875, rgb: [244, 105, 9] },
    { pos: 1.0, rgb: [122, 4, 3] },
  ],

  // ── viridis: 紫 → 蓝 → 青 → 黄绿 → 黄 (默认 matplotlib, 色弱友好) ─────
  // 数据来源: matplotlib viridis LUT 在 [0/8, 1/8, ..., 8/8] 位置的实际采样
  viridis: [
    { pos: 0.0, rgb: [68, 1, 84] },
    { pos: 0.125, rgb: [72, 32, 113] },
    { pos: 0.25, rgb: [61, 75, 138] },
    { pos: 0.375, rgb: [47, 110, 142] },
    { pos: 0.5, rgb: [33, 144, 141] },
    { pos: 0.625, rgb: [40, 174, 128] },
    { pos: 0.75, rgb: [94, 201, 97] },
    { pos: 0.875, rgb: [181, 222, 43] },
    { pos: 1.0, rgb: [253, 231, 37] },
  ],

  // ── bone: 黑 → 蓝灰 → 浅灰 → 白 (蓝调灰阶, 类似 X-ray) ────────────────
  // 数据来源: matplotlib bone LUT 在 [0/8, 1/8, ..., 8/8] 位置的实际采样
  bone: [
    { pos: 0.0, rgb: [0, 0, 0] },
    { pos: 0.125, rgb: [28, 28, 39] },
    { pos: 0.25, rgb: [55, 55, 78] },
    { pos: 0.375, rgb: [83, 86, 116] },
    { pos: 0.5, rgb: [87, 117, 117] },
    { pos: 0.625, rgb: [113, 144, 144] },
    { pos: 0.75, rgb: [140, 172, 172] },
    { pos: 0.875, rgb: [197, 218, 218] },
    { pos: 1.0, rgb: [255, 255, 255] },
  ],

  // ── cividis: 深蓝 → 灰黄 → 亮黄 (色弱友好, 适合论文图) ─────────────────
  // 数据来源: matplotlib cividis LUT 在 [0/8, 1/8, ..., 8/8] 位置的实际采样
  cividis: [
    { pos: 0.0, rgb: [0, 32, 76] },
    { pos: 0.125, rgb: [0, 51, 105] },
    { pos: 0.25, rgb: [44, 75, 110] },
    { pos: 0.375, rgb: [74, 90, 121] },
    { pos: 0.5, rgb: [101, 110, 124] },
    { pos: 0.625, rgb: [130, 132, 121] },
    { pos: 0.75, rgb: [160, 154, 117] },
    { pos: 0.875, rgb: [197, 178, 105] },
    { pos: 1.0, rgb: [255, 234, 70] },
  ],
}

// ── 核心生成逻辑 ────────────────────────────────────────────────────────────

/**
 * 把一组 anchor stops 在 RGB 空间线性插值, 生成 256x4 RGBA 表.
 *
 * 算法:
 *   for i in 0..255:
 *     t = i / 255  ∈ [0, 1]
 *     找到 stops[k] <= t < stops[k+1]
 *     local_t = (t - stops[k].pos) / (stops[k+1].pos - stops[k].pos)
 *     rgb = lerp(stops[k].rgb, stops[k+1].rgb, local_t)
 *     output[i*4..i*4+3] = rgb + 255
 *
 * 边界处理:
 *   - t=0 → 取第一个 stop
 *   - t=1 → 取最后一个 stop
 *   - stops 必须有至少 2 个点, 第一个 pos=0, 最后一个 pos=1, 严格递增
 *     (本模块内的 COLORMAP_STOPS 都满足, 外部传入需自检)
 */
export function buildColormapLUT(stops: readonly ColormapStop[]): Uint8Array {
  if (stops.length < 2) {
    throw new Error('buildColormapLUT 至少需要 2 个 stop')
  }

  const lut = new Uint8Array(256 * 4)
  let segIdx = 0 // 当前所在的 stop 区间下标 (left)

  for (let i = 0; i < 256; i++) {
    const t = i / 255

    // 推进 segIdx 直到 stops[segIdx+1].pos >= t
    while (segIdx < stops.length - 2 && stops[segIdx + 1]!.pos < t) {
      segIdx++
    }

    const left = stops[segIdx]!
    const right = stops[segIdx + 1]!
    const span = right.pos - left.pos
    // span 不可能为 0 (假设严格递增), 但保险起见
    const localT = span > 0 ? (t - left.pos) / span : 0

    const r = Math.round(left.rgb[0] + (right.rgb[0] - left.rgb[0]) * localT)
    const g = Math.round(left.rgb[1] + (right.rgb[1] - left.rgb[1]) * localT)
    const b = Math.round(left.rgb[2] + (right.rgb[2] - left.rgb[2]) * localT)

    const off = i * 4
    lut[off] = r
    lut[off + 1] = g
    lut[off + 2] = b
    lut[off + 3] = 255
  }

  return lut
}

// ── 缓存 + 公共 API ────────────────────────────────────────────────────────

/**
 * LUT 缓存. 每个 colormap 的 LUT 是不可变的, 256*4 = 1KB, 7 个共 7KB,
 * 远小于一张图. 首次访问时 lazy 构建, 之后命中缓存.
 */
const LUT_CACHE = new Map<ColormapId, Uint8Array>()

/**
 * 取得指定 colormap 的 256x4 RGBA LUT. 多次调用同一 id 返回同一引用.
 *
 * @example
 * const lut = getColormapLUT('inferno')
 * // lut 是 Uint8Array(1024), 可以直接传给 lib/depth.applyColormap
 */
export function getColormapLUT(id: ColormapId): Uint8Array {
  let cached = LUT_CACHE.get(id)
  if (!cached) {
    cached = buildColormapLUT(COLORMAP_STOPS[id])
    LUT_CACHE.set(id, cached)
  }
  return cached
}

/** 仅用于测试 — 暴露内部 stops 表用于校验 anchor 数据完整性 */
export const __COLORMAP_STOPS_FOR_TESTS = COLORMAP_STOPS

/** 重新导出 COLORMAP_IDS 以便上层只 import 本模块就能拿到所有定义 */
export { COLORMAP_IDS } from './constants'
