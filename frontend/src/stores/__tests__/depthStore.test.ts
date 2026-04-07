/**
 * depthStore.test.ts — 深度数据 store 单元测试
 *
 * 验证:
 * - 初始状态符合 SPEC §8 默认 (全 null/0)
 * - setResult 原子更新所有结果字段 + isProcessing 自动 false
 * - setOriginal/setProcessing 单职责
 * - clear 完全清空但不主动 close ImageBitmap (副作用应在调用方)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { DEPTH_STORE_INITIAL, useDepthStore } from '../depthStore'
import type { DepthStats } from '../../lib/depth'

beforeEach(() => {
  useDepthStore.setState(DEPTH_STORE_INITIAL)
})

/** 构造一个简单的 stub ImageBitmap (happy-dom 不实现, 用 plain object 替代) */
function fakeBitmap(width = 100, height = 50): ImageBitmap {
  return { width, height, close: () => undefined } as unknown as ImageBitmap
}

const sampleStats: DepthStats = { min: 0.1, max: 0.9, mean: 0.5, median: 0.55 }

describe('depthStore — 初始状态', () => {
  it('字段默认值与 SPEC §8 一致', () => {
    const s = useDepthStore.getState()
    expect(s.originalImage).toBeNull()
    expect(s.depthMap).toBeNull()
    expect(s.width).toBe(0)
    expect(s.height).toBe(0)
    expect(s.stats).toBeNull()
    expect(s.isProcessing).toBe(false)
    expect(s.inferenceMs).toBe(0)
  })
})

describe('depthStore — setResult', () => {
  it('原子地更新 5 个结果字段 + isProcessing=false', () => {
    useDepthStore.getState().setProcessing(true) // 先标记为处理中
    const depth = new Float32Array([0.1, 0.5, 0.9])

    useDepthStore.getState().setResult(depth, 3, 1, 42, sampleStats)

    const s = useDepthStore.getState()
    expect(s.depthMap).toBe(depth) // 同引用
    expect(s.width).toBe(3)
    expect(s.height).toBe(1)
    expect(s.inferenceMs).toBe(42)
    expect(s.stats).toEqual(sampleStats)
    expect(s.isProcessing).toBe(false) // 自动重置
  })

  it('不影响 originalImage', () => {
    const bmp = fakeBitmap()
    useDepthStore.getState().setOriginal(bmp)
    useDepthStore.getState().setResult(new Float32Array(1), 1, 1, 10, sampleStats)
    expect(useDepthStore.getState().originalImage).toBe(bmp)
  })
})

describe('depthStore — setOriginal', () => {
  it('写入 ImageBitmap', () => {
    const bmp = fakeBitmap(640, 480)
    useDepthStore.getState().setOriginal(bmp)
    expect(useDepthStore.getState().originalImage).toBe(bmp)
  })

  it('替换不主动 close 旧 bitmap (副作用属调用方)', () => {
    let closed = false
    const oldBmp = {
      width: 100,
      height: 50,
      close: () => {
        closed = true
      },
    } as unknown as ImageBitmap
    useDepthStore.getState().setOriginal(oldBmp)
    useDepthStore.getState().setOriginal(fakeBitmap())
    expect(closed).toBe(false) // store 不动 GPU
  })
})

describe('depthStore — setProcessing', () => {
  it('true / false 切换', () => {
    useDepthStore.getState().setProcessing(true)
    expect(useDepthStore.getState().isProcessing).toBe(true)
    useDepthStore.getState().setProcessing(false)
    expect(useDepthStore.getState().isProcessing).toBe(false)
  })
})

describe('depthStore — clear', () => {
  it('完全清空所有字段', () => {
    useDepthStore.getState().setOriginal(fakeBitmap())
    useDepthStore.getState().setResult(new Float32Array(4), 2, 2, 100, sampleStats)
    useDepthStore.getState().setProcessing(true)
    useDepthStore.getState().clear()

    const s = useDepthStore.getState()
    expect(s.originalImage).toBeNull()
    expect(s.depthMap).toBeNull()
    expect(s.width).toBe(0)
    expect(s.height).toBe(0)
    expect(s.stats).toBeNull()
    expect(s.isProcessing).toBe(false)
    expect(s.inferenceMs).toBe(0)
  })

  it('不调 close (副作用属调用方)', () => {
    let closed = false
    const bmp = {
      width: 1,
      height: 1,
      close: () => {
        closed = true
      },
    } as unknown as ImageBitmap
    useDepthStore.getState().setOriginal(bmp)
    useDepthStore.getState().clear()
    expect(closed).toBe(false)
  })

  it('clear 是幂等的 (重复调用不报错)', () => {
    useDepthStore.getState().clear()
    useDepthStore.getState().clear()
    useDepthStore.getState().clear()
    expect(useDepthStore.getState().depthMap).toBeNull()
  })
})

describe('depthStore — 序列与替换', () => {
  it('setResult 替换前一次的全部结果字段', () => {
    const d1 = new Float32Array([0.1, 0.2])
    const stats1: DepthStats = { min: 0.1, max: 0.2, mean: 0.15, median: 0.15 }
    useDepthStore.getState().setResult(d1, 2, 1, 10, stats1)

    const d2 = new Float32Array([0.5, 0.6, 0.7, 0.8])
    const stats2: DepthStats = { min: 0.5, max: 0.8, mean: 0.65, median: 0.65 }
    useDepthStore.getState().setResult(d2, 4, 1, 25, stats2)

    const s = useDepthStore.getState()
    expect(s.depthMap).toBe(d2)
    expect(s.width).toBe(4)
    expect(s.height).toBe(1)
    expect(s.inferenceMs).toBe(25)
    expect(s.stats).toEqual(stats2)
  })

  it('setResult 接受空 Float32Array (不阻断, 不验证 length)', () => {
    const empty = new Float32Array(0)
    useDepthStore
      .getState()
      .setResult(empty, 0, 0, 5, { min: 0, max: 0, mean: 0, median: 0 })
    expect(useDepthStore.getState().depthMap).toBe(empty)
    expect(useDepthStore.getState().width).toBe(0)
  })

  it('setProcessing(true) → setResult → isProcessing 自动 false', () => {
    useDepthStore.getState().setProcessing(true)
    expect(useDepthStore.getState().isProcessing).toBe(true)

    useDepthStore
      .getState()
      .setResult(new Float32Array(1), 1, 1, 10, sampleStats)

    expect(useDepthStore.getState().isProcessing).toBe(false)
  })

  it('setOriginal 替换链 A → B → null', () => {
    const a = fakeBitmap(100, 100)
    const b = fakeBitmap(200, 200)
    useDepthStore.getState().setOriginal(a)
    expect(useDepthStore.getState().originalImage).toBe(a)
    useDepthStore.getState().setOriginal(b)
    expect(useDepthStore.getState().originalImage).toBe(b)
    // null 这种 case 实际由 clear 触发, 但 setOriginal 也能直接接受
    // (TypeScript 上 setOriginal 类型签名是 ImageBitmap, 不允许 null;
    //  调用方应当 clear 而非 setOriginal(null), 这里不测以匹配类型)
  })

  it('stats 引用独立 (前后两次 setResult 的 stats 不会窜改)', () => {
    const stats1: DepthStats = { min: 0.1, max: 0.2, mean: 0.15, median: 0.15 }
    useDepthStore
      .getState()
      .setResult(new Float32Array(1), 1, 1, 1, stats1)
    const captured = useDepthStore.getState().stats

    const stats2: DepthStats = { min: 0.7, max: 0.9, mean: 0.8, median: 0.8 }
    useDepthStore
      .getState()
      .setResult(new Float32Array(1), 1, 1, 1, stats2)

    // 第一次捕获的快照不应被第二次 setResult 影响
    expect(captured).toEqual({ min: 0.1, max: 0.2, mean: 0.15, median: 0.15 })
    // store 现在拿的是 stats2
    expect(useDepthStore.getState().stats).toEqual(stats2)
  })
})
