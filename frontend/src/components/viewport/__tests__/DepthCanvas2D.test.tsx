/**
 * DepthCanvas2D 组件层测试
 *
 * 覆盖 layout_smoke.test.tsx 没有覆盖的"有数据"路径:
 *   1. 有效深度数据时渲染 canvas (WebGL 路径, 用 mock GL)
 *   2. 切换 colormap 不 remount canvas (canvas 引用稳定, 触发 morph)
 *   3. 切换深度 → focus-reveal 动画重置 (canvas.style.animation 被清空再重设)
 *   4. WebGL2 不可用 → fallback 到 Canvas 2D 路径 (mock 2d context, 验证 putImageData)
 *   5. 卸载时 dispose() 释放 GPU 资源 (deleteTexture / deleteProgram 被调用)
 *
 * mock GL 来自 lib/__tests__/__fixtures__/mockWebGL.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { DepthCanvas2D } from '../DepthCanvas2D'
import {
  useDepthStore,
  DEPTH_STORE_INITIAL,
} from '../../../stores/depthStore'
import {
  useViewportStore,
  VIEWPORT_STORE_INITIAL,
} from '../../../stores/viewportStore'
import {
  createMockGl,
  createMockState,
  patchCanvasGetContext,
  type MockGlState,
} from '../../../lib/__tests__/__fixtures__/mockWebGL'

// ── mount 辅助 ──────────────────────────────────────────────────────────────

interface Mounted {
  container: HTMLDivElement
  unmount: () => void
}

async function mount(node: React.ReactElement): Promise<Mounted> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root: Root
  await act(async () => {
    root = createRoot(container)
    root.render(node)
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

/** 用伪深度数据初始化 store, 触发 hasValidData=true */
function seedDepthStore(w = 4, h = 3): Float32Array {
  const depth = new Float32Array(w * h)
  for (let i = 0; i < depth.length; i++) depth[i] = i / (depth.length - 1)
  useDepthStore.setState({
    depthMap: depth,
    width: w,
    height: h,
    inferenceMs: 10,
    stats: { min: 0, max: 1, mean: 0.5, median: 0.5 },
    isProcessing: false,
  })
  return depth
}

// ── 测试 hooks ──────────────────────────────────────────────────────────────

let mockState: MockGlState
let mockGl: WebGL2RenderingContext | null
let restore: () => void
// fallback 路径需要 mock 2d context
let mock2dCtx: {
  putImageData: ReturnType<typeof vi.fn>
} | null

beforeEach(() => {
  // 默认: WebGL 可用
  mockState = createMockState()
  mockGl = createMockGl(mockState)
  mock2dCtx = {
    putImageData: vi.fn(),
  }
  // 自定义 patch: 'webgl2' 走 mockGl, '2d' 走 mock2dCtx
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (
    contextId: string
  ): unknown {
    if (contextId === 'webgl2') return mockGl
    if (contextId === '2d') return mock2dCtx
    return null
  } as typeof HTMLCanvasElement.prototype.getContext
  restore = () => {
    HTMLCanvasElement.prototype.getContext = original
  }
  // mock requestAnimationFrame — happy-dom 没实现, 否则 effect 5 会 throw
  if (typeof globalThis.requestAnimationFrame === 'undefined') {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 16) as unknown as number
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
      clearTimeout(id)
    }) as typeof cancelAnimationFrame
  }

  useDepthStore.setState({ ...DEPTH_STORE_INITIAL })
  useViewportStore.setState({ ...VIEWPORT_STORE_INITIAL })
})

afterEach(() => {
  restore()
  useDepthStore.setState({ ...DEPTH_STORE_INITIAL })
  useViewportStore.setState({ ...VIEWPORT_STORE_INITIAL })
})

// ── WebGL 成功路径 ─────────────────────────────────────────────────────────

describe('DepthCanvas2D — WebGL 路径', () => {
  it('有效深度数据时渲染 canvas, 上传 R32F 纹理', async () => {
    seedDepthStore(4, 3)
    const m = await mount(createElement(DepthCanvas2D))
    const canvas = m.container.querySelector('canvas')
    expect(canvas).not.toBeNull()

    // R32F 上传调用 (internalformat = 0x822e)
    const r32fCalls = mockState.texImage2DCalls.filter(
      (c) => c.internalformat === 0x822e
    )
    expect(r32fCalls.length).toBeGreaterThanOrEqual(1)
    expect(r32fCalls[0]!.width).toBe(4)
    expect(r32fCalls[0]!.height).toBe(3)
    m.unmount()
  })

  it('上传初始 LUT (256x1 RGBA8) 两次 (A=B=lut)', async () => {
    seedDepthStore(4, 3)
    const m = await mount(createElement(DepthCanvas2D))
    const lutCalls = mockState.texImage2DCalls.filter(
      (c) => c.width === 256 && c.height === 1
    )
    expect(lutCalls.length).toBe(2) // 首次 setLut: A 和 B 都上传
    m.unmount()
  })

  it('切换 colormap 触发额外 2 次 LUT 上传 (B←旧 A←新), canvas DOM 不变', async () => {
    seedDepthStore(4, 3)
    const m = await mount(createElement(DepthCanvas2D))
    const canvasBefore = m.container.querySelector('canvas')
    const lutCallsBefore = mockState.texImage2DCalls.filter(
      (c) => c.width === 256 && c.height === 1
    ).length

    await act(async () => {
      useViewportStore.getState().setColormap('viridis')
    })

    const canvasAfter = m.container.querySelector('canvas')
    expect(canvasAfter).toBe(canvasBefore) // 同一 DOM 引用, 没 remount
    const lutCallsAfter = mockState.texImage2DCalls.filter(
      (c) => c.width === 256 && c.height === 1
    ).length
    // 切换后又多 2 次上传 (B←旧 lut, A←新 lut)
    expect(lutCallsAfter).toBe(lutCallsBefore + 2)
    m.unmount()
  })

  it('卸载时调用 dispose() — deleteTexture 被调 3 次, deleteProgram 1 次', async () => {
    seedDepthStore(4, 3)
    const m = await mount(createElement(DepthCanvas2D))
    expect(mockState.deleteTextureCalls).toBe(0)
    m.unmount()
    expect(mockState.deleteTextureCalls).toBe(3) // depth + lutA + lutB
    expect(mockState.deleteProgramCalls).toBe(1)
  })
})

// ── focus-reveal epoch 重置 ────────────────────────────────────────────────

describe('DepthCanvas2D — focus-reveal 重置', () => {
  it('首次渲染设置 canvas.style.animation 为 focus-reveal', async () => {
    seedDepthStore(4, 3)
    const m = await mount(createElement(DepthCanvas2D))
    const canvas = m.container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.animation).toContain('focus-reveal')
    m.unmount()
  })

  it('替换深度 (相同尺寸) → epoch 增加 → animation 重置', async () => {
    seedDepthStore(4, 3)
    const m = await mount(createElement(DepthCanvas2D))
    const canvas = m.container.querySelector('canvas') as HTMLCanvasElement
    const epochBefore = canvas.dataset.epoch
    expect(epochBefore).toBeDefined()

    // 用相同尺寸的新 Float32Array 替换
    await act(async () => {
      const newDepth = new Float32Array(4 * 3)
      newDepth.fill(0.5)
      useDepthStore.setState({
        depthMap: newDepth,
        width: 4,
        height: 3,
      })
    })

    const canvasAfter = m.container.querySelector('canvas') as HTMLCanvasElement
    // 同一 canvas DOM 引用 (没 remount, WebGL context 保留)
    expect(canvasAfter).toBe(canvas)
    // epoch 已增加
    expect(canvasAfter.dataset.epoch).not.toBe(epochBefore)
    expect(Number(canvasAfter.dataset.epoch)).toBeGreaterThan(Number(epochBefore))
    // animation 仍是 focus-reveal (effect 重设的最终值)
    expect(canvasAfter.style.animation).toContain('focus-reveal')
    m.unmount()
  })
})

// ── fallback 路径 (无 WebGL2) ──────────────────────────────────────────────

describe('DepthCanvas2D — fallback (无 WebGL2)', () => {
  it('mockGl=null → 走 Canvas 2D + putImageData', async () => {
    mockGl = null // 模拟浏览器不支持 WebGL2
    seedDepthStore(4, 3)
    const m = await mount(createElement(DepthCanvas2D))

    // 没有 R32F 上传 (没走 WebGL 路径)
    const r32fCalls = mockState.texImage2DCalls.filter(
      (c) => c.internalformat === 0x822e
    )
    expect(r32fCalls.length).toBe(0)

    // putImageData 被调用 (走了 fallback)
    expect(mock2dCtx!.putImageData).toHaveBeenCalled()
    m.unmount()
  })

  it('fallback 路径切 colormap 也会重新 putImageData', async () => {
    mockGl = null
    seedDepthStore(4, 3)
    const m = await mount(createElement(DepthCanvas2D))
    const callCountBefore = mock2dCtx!.putImageData.mock.calls.length

    await act(async () => {
      useViewportStore.getState().setColormap('viridis')
    })

    const callCountAfter = mock2dCtx!.putImageData.mock.calls.length
    expect(callCountAfter).toBeGreaterThan(callCountBefore)
    m.unmount()
  })
})
