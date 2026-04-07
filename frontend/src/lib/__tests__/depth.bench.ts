/**
 * depth.bench.ts — applyColormap 性能基准
 *
 * 通过 vitest bench API 实测 applyColormap 在 480p / 720p / 1080p 三种分辨率
 * 下的吞吐, 用于校验 SPEC §9 性能红线 "色彩映射切换 < 16ms (纯前端)".
 *
 * 运行: pnpm exec vitest bench
 *
 * 注意:
 * - bench 文件不在 vitest run 的 include 范围内 (test 配置 src/**\/*.test.ts),
 *   所以普通 pnpm test 不会跑它. 需要时手动 vitest bench 触发.
 * - happy-dom 环境 + Node.js JIT 会比真实浏览器 V8 略慢, 实测数值是悲观估计.
 * - 同一硬件上多次运行结果会有 ±20% 抖动, 这是正常的.
 */
import { bench, describe } from 'vitest'
import { applyColormap } from '../depth'
import { getColormapLUT } from '../colormaps'

const lut = getColormapLUT('inferno')

/** 构造一份均匀变化的伪深度数据 (用真实数据形态而非全 0) */
function makeDepth(n: number): Float32Array {
  const arr = new Float32Array(n)
  for (let i = 0; i < n; i++) arr[i] = (i % 1000) / 1000
  return arr
}

describe('applyColormap throughput (SPEC 红线: < 16ms)', () => {
  // 480p ≈ 854x480 = 410k 像素
  const depth480 = makeDepth(854 * 480)
  bench('480p (854x480, 410k px)', () => {
    applyColormap(depth480, 854, 480, lut)
  })

  // 720p ≈ 1280x720 = 922k 像素
  const depth720 = makeDepth(1280 * 720)
  bench('720p (1280x720, 922k px)', () => {
    applyColormap(depth720, 1280, 720, lut)
  })

  // 1080p ≈ 1920x1080 = 2.07M 像素
  const depth1080 = makeDepth(1920 * 1080)
  bench('1080p (1920x1080, 2.07M px)', () => {
    applyColormap(depth1080, 1920, 1080, lut)
  })
})
