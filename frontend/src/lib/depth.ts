/**
 * lib/depth.ts — 深度图前端处理纯函数
 *
 * 后端流程: 模型推理 → numpy 归一化到 [0,1] → encode_float32_b64 → JSON
 * 前端流程 (本模块): decodeDepthBase64 → applyColormap → ImageData
 *
 * 与 backend/app/core/depth_utils.py 一一对齐:
 * - normalize 在后端完成, 前端拿到的已经是 [0,1] float32
 * - computeStats 是相同算法的前端版本
 * - applyColormap 是前端独有 (后端不做色彩映射, 见 SPEC §6.3 数据传输格式)
 *
 * 注: invertDepth / range clipping 等"用户偏好"功能属于 Phase 2 viewport 任务,
 * 不在 Phase 1 lib 范围内.
 */

// ── 类型 ────────────────────────────────────────────────────────────────────

/** 与 backend schemas.DepthStats 字段一一对齐 */
export interface DepthStats {
  min: number
  max: number
  mean: number
  median: number
}

// ── 1. base64 解码 ─────────────────────────────────────────────────────────

/**
 * 把后端返回的 base64 字符串解码为 Float32Array.
 *
 * 后端约定 (见 backend/app/core/depth_utils.encode_float32_b64):
 *   ascontiguousarray(depth, dtype=float32).tobytes() → b64encode → ascii
 *
 * 浏览器解码 (与后端 docstring 中的 JS 例子一致):
 *   atob(b64) → string → 每个字符的 charCodeAt → Uint8Array → buffer → Float32Array
 *
 * @throws 当 byteLength % 4 !== 0 (数据损坏)
 */
export function decodeDepthBase64(b64: string): Float32Array {
  const binary = atob(b64)
  const len = binary.length
  if (len % 4 !== 0) {
    throw new Error(
      `decodeDepthBase64: 数据长度 ${len} 不是 4 的倍数, 不能解释为 float32`
    )
  }
  const u8 = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    u8[i] = binary.charCodeAt(i)
  }
  // 使用 .buffer 直接 zero-copy 转 Float32Array
  return new Float32Array(u8.buffer)
}

// ── 2. 统计 (与 backend depth_utils.compute_stats 等价) ────────────────────

/**
 * 计算深度数组的 min/max/mean/median.
 *
 * 注意:
 * - O(n) 单次扫描计算 min/max/sum (后续除以 n 得到 mean)
 * - median 需要排序, 复制一份避免污染原数组, 用 Array.sort O(n log n)
 *   * 1080p 帧 ≈ 200 万元素, 排序 ~50ms, 可接受
 *   * 调用方需要 60fps 实时统计时应自行降采样
 * - 空数组返回全 0 (避免抛异常, 与后端 normalize 边界行为一致)
 *
 * NaN / Infinity 处理:
 * - 后端 depth_utils.normalize() 已经把 NaN → 0, Inf → 有限边界,
 *   所以 *理论上* 前端永远不会收到非有限值
 * - 防御性: 本函数把非有限元素**视为不存在**, 既不参与 min/max/mean/median
 *   的统计 (与 numpy.nanmin / nanmax / nanmean / nanmedian 行为一致),
 *   全部都是 NaN / 全部空时返回 0 占位
 */
export function computeStats(depth: Float32Array): DepthStats {
  const n = depth.length
  if (n === 0) {
    return { min: 0, max: 0, mean: 0, median: 0 }
  }

  // 一次扫描: 跳过非有限值, 同时记录 min/max/sum/count
  let min = Infinity
  let max = -Infinity
  let sum = 0
  let count = 0

  for (let i = 0; i < n; i++) {
    const v = depth[i]!
    if (!Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
    sum += v
    count++
  }

  if (count === 0) {
    // 全部是 NaN / Inf, 返回占位 (与空数组分支一致)
    return { min: 0, max: 0, mean: 0, median: 0 }
  }

  // 中位数: 把所有有限值复制出来排序. 大多数情况 count === n, 直接 slice
  let finite: Float32Array
  if (count === n) {
    finite = depth.slice()
  } else {
    finite = new Float32Array(count)
    let j = 0
    for (let i = 0; i < n; i++) {
      const v = depth[i]!
      if (Number.isFinite(v)) finite[j++] = v
    }
  }
  finite.sort()
  const mid = count >>> 1
  const median = count % 2 === 0 ? (finite[mid - 1]! + finite[mid]!) / 2 : finite[mid]!

  return {
    min,
    max,
    mean: sum / count,
    median,
  }
}

// ── 3. applyColormap: float32 + LUT → ImageData ────────────────────────────

/**
 * 把 [0,1] float32 深度图通过 LUT 映射成 RGBA ImageData, 可直接喂给
 * Canvas 2D 的 ``ctx.putImageData()``.
 *
 * @param depth   row-major float32 数组, 长度必须 = width * height
 * @param width   像素宽
 * @param height  像素高
 * @param lut     256*4 RGBA Uint8Array, 由 lib/colormaps.getColormapLUT() 提供
 *
 * @throws RangeError 如果 depth.length !== width * height 或 lut.length !== 1024
 *
 * 行为:
 * - 输入值 < 0 或 > 1 自动 clamp (不抛错, 视觉降级)
 * - 输入 NaN / Infinity 视为 0 (映射到 LUT[0], 防御)
 * - alpha 通道始终 255
 *
 * 性能 (实测, vitest bench, happy-dom + Node v24, 见 depth.bench.ts):
 *   - 480p  (410k px) : ~1.3ms 均值,  5.0ms p99
 *   - 720p  (922k px) : ~2.8ms 均值,  6.6ms p99
 *   - 1080p (2.07M px): ~6.3ms 均值, 10.8ms p99
 * 全部在 SPEC §9 "色彩映射切换 < 16ms (纯前端)" 红线内.
 *
 * 优化技巧:
 * - 内联 LUT 索引 / 避免 typed array 的属性查找
 * - 不在循环里 allocate (Uint8ClampedArray 一次性建好)
 * - NaN 防御放在 clamp 前 (NaN 比较恒为 false 会绕过 clamp)
 */
export function applyColormap(
  depth: Float32Array,
  width: number,
  height: number,
  lut: Uint8Array
): ImageData {
  const expected = width * height
  if (depth.length !== expected) {
    throw new RangeError(
      `applyColormap: depth.length (${depth.length}) !== width*height (${expected})`
    )
  }
  if (lut.length !== 256 * 4) {
    throw new RangeError(
      `applyColormap: lut.length (${lut.length}) !== 1024 (256 RGBA)`
    )
  }

  const out = new Uint8ClampedArray(expected * 4)

  for (let i = 0; i < expected; i++) {
    let v = depth[i]!

    // NaN / Infinity 防御 — 后端 normalize() 已经过滤, 这里是双保险.
    // 必须放在 clamp 之前, 因为 NaN 与任何数比较都返回 false, 会绕过 clamp.
    if (!Number.isFinite(v)) v = 0

    // clamp 到 [0, 1]
    if (v < 0) v = 0
    else if (v > 1) v = 1

    // LUT 索引 0..255
    const idx = (v * 255 + 0.5) | 0 // | 0 = floor for non-negative
    const lutOff = idx * 4

    const outOff = i * 4
    out[outOff] = lut[lutOff]!
    out[outOff + 1] = lut[lutOff + 1]!
    out[outOff + 2] = lut[lutOff + 2]!
    out[outOff + 3] = lut[lutOff + 3]!
  }

  return new ImageData(out, width, height)
}
