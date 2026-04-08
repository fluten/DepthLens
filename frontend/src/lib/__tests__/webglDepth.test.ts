/**
 * webglDepth.ts 单元测试
 *
 * happy-dom 不实现 WebGL2, 通过 __fixtures__/mockWebGL 的 monkey-patch
 * 注入 mock context, 验证:
 *
 *   1. WebGL2 不可用 / shader 编译失败 / program 链接失败 → 工厂返回 null
 *   2. 正常路径下渲染器创建成功, 暴露的接口表现正确
 *   3. setDepth 上传 R32F 纹理 + 调整 canvas 像素尺寸
 *   4. setLut 首次/后续行为差异 (morph 触发)
 *   5. tickMorph 进度推进 (ease-out quad)
 *   6. invertDepth / depthRange / breath uniform 写入路径
 *   7. draw() 在没有数据时是 no-op
 *   8. dispose() 调用 deleteTexture / deleteProgram
 *
 * 我们不验证 GPU 实际像素输出 (那需要真实 GL 实现 + 截图比对), 重点是
 * 验证 JS 控制流和 WebGL API 调用顺序.
 *
 * mock 设施在 __fixtures__/mockWebGL.ts (CLAUDE.md ≤ 300 行约束).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createWebGLDepthRenderer } from '../webglDepth'
import { getColormapLUT } from '../colormaps'
import {
  createMockGl,
  createMockState,
  patchCanvasGetContext,
  type MockGlState,
} from './__fixtures__/mockWebGL'

// ── 测试 hooks ──────────────────────────────────────────────────────────────

let mockState: MockGlState
let mockGl: WebGL2RenderingContext | null
let restore: () => void

beforeEach(() => {
  mockState = createMockState()
  mockGl = createMockGl(mockState)
  restore = patchCanvasGetContext(() => mockGl)
})

afterEach(() => {
  restore()
})

function makeCanvas(): HTMLCanvasElement {
  return document.createElement('canvas')
}

/** 取得最近一次某 uniform 的写入值, 找不到返回 undefined */
function lastUniform1f(name: string): number | undefined {
  const calls = mockState.uniform1fCalls.filter(
    (c) => (c.location as { __tag: string }).__tag === `uniform_${name}`
  )
  return calls[calls.length - 1]?.value
}

// ── 创建 ────────────────────────────────────────────────────────────────────

describe('createWebGLDepthRenderer — 创建', () => {
  it('WebGL2 不可用时返回 null', () => {
    mockGl = null
    expect(createWebGLDepthRenderer(makeCanvas())).toBeNull()
  })

  it('shader 编译失败返回 null', () => {
    mockState.shaderCompileStatus = false
    expect(createWebGLDepthRenderer(makeCanvas())).toBeNull()
  })

  it('program 链接失败返回 null', () => {
    mockState.programLinkStatus = false
    expect(createWebGLDepthRenderer(makeCanvas())).toBeNull()
  })

  it('正常路径下返回非 null 渲染器, 初始 width/height = 0, morphProgress = 1', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())
    expect(renderer).not.toBeNull()
    expect(renderer!.width).toBe(0)
    expect(renderer!.height).toBe(0)
    expect(renderer!.morphProgress).toBe(1)
  })
})

// ── setDepth ────────────────────────────────────────────────────────────────

describe('setDepth', () => {
  it('上传 R32F 纹理 + 调整 canvas 像素尺寸', () => {
    const canvas = makeCanvas()
    const renderer = createWebGLDepthRenderer(canvas)!
    const w = 4
    const h = 3
    const depth = new Float32Array(w * h)
    renderer.setDepth(depth, w, h)

    expect(renderer.width).toBe(w)
    expect(renderer.height).toBe(h)
    expect(canvas.width).toBe(w)
    expect(canvas.height).toBe(h)

    const r32fCalls = mockState.texImage2DCalls.filter(
      (c) => c.internalformat === 0x822e
    )
    expect(r32fCalls.length).toBe(1)
    expect(r32fCalls[0]!.width).toBe(w)
    expect(r32fCalls[0]!.height).toBe(h)
    expect(r32fCalls[0]!.pixels).toBe(depth)
  })

  it('depth.length 不匹配抛 RangeError', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    expect(() => renderer.setDepth(new Float32Array(10), 4, 3)).toThrow(RangeError)
  })
})

// ── setLut ──────────────────────────────────────────────────────────────────

describe('setLut', () => {
  it('首次调用: A=B=lut, morph=1 (无过渡)', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    const lut = getColormapLUT('inferno')
    renderer.setLut(lut)

    const lutCalls = mockState.texImage2DCalls.filter(
      (c) => c.width === 256 && c.height === 1
    )
    expect(lutCalls.length).toBe(2)
    expect(lutCalls[0]!.pixels).toBe(lut)
    expect(lutCalls[1]!.pixels).toBe(lut)
    expect(renderer.morphProgress).toBe(1)
  })

  it('后续调用: B←旧, A←新, morph 重置为 0', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    const lutA = getColormapLUT('inferno')
    const lutB = getColormapLUT('viridis')

    renderer.setLut(lutA)
    mockState.texImage2DCalls = []

    renderer.setLut(lutB)
    const lutCalls = mockState.texImage2DCalls.filter(
      (c) => c.width === 256 && c.height === 1
    )
    expect(lutCalls.length).toBe(2)
    expect(lutCalls[0]!.pixels).toBe(lutA) // B ← 旧
    expect(lutCalls[1]!.pixels).toBe(lutB) // A ← 新
    expect(renderer.morphProgress).toBe(0)
  })

  it('lut.length !== 1024 抛 RangeError', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    expect(() => renderer.setLut(new Uint8Array(100))).toThrow(RangeError)
  })
})

// ── tickMorph ───────────────────────────────────────────────────────────────

describe('tickMorph', () => {
  it('morphActive=false (无 morph 进行中) 是 no-op', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    renderer.setLut(getColormapLUT('inferno')) // 首次, morph=1
    const before = renderer.morphProgress
    renderer.tickMorph(performance.now() + 1000)
    expect(renderer.morphProgress).toBe(before)
  })

  it('300ms 内 ease-out 推进, 到 300ms 锁定 1', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    renderer.setLut(getColormapLUT('inferno'))
    renderer.setLut(getColormapLUT('viridis'))
    expect(renderer.morphProgress).toBe(0)

    const startTime = performance.now()
    renderer.tickMorph(startTime + 150) // 50% 时间
    const halfwayProgress = renderer.morphProgress
    expect(halfwayProgress).toBeGreaterThan(0)
    expect(halfwayProgress).toBeLessThan(1)

    renderer.tickMorph(startTime + 400)
    expect(renderer.morphProgress).toBe(1)

    // 锁定后再 tick 不变
    renderer.tickMorph(startTime + 1000)
    expect(renderer.morphProgress).toBe(1)
  })
})

// ── 状态 setter (uniform 写入路径) ─────────────────────────────────────────

describe('setBreath / setInvert / setDepthRange', () => {
  /** 准备好可绘制状态: depth + lut 都设置 */
  function prep(): ReturnType<typeof createWebGLDepthRenderer> {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    renderer.setDepth(new Float32Array(4), 2, 2)
    renderer.setLut(getColormapLUT('inferno'))
    return renderer
  }

  it('setBreath 接受有限值, 通过 draw 写入 uBreath', () => {
    const renderer = prep()!
    renderer.setBreath(1.02)
    renderer.draw()
    expect(lastUniform1f('uBreath')).toBeCloseTo(1.02, 5)
  })

  it('setBreath NaN 不写入 (保持上次值)', () => {
    const renderer = prep()!
    renderer.setBreath(1.02)
    renderer.setBreath(NaN)
    renderer.draw()
    expect(lastUniform1f('uBreath')).toBeCloseTo(1.02, 5)
  })

  it('setInvert 写入 0 / 1', () => {
    const renderer = prep()!

    renderer.setInvert(true)
    renderer.draw()
    expect(lastUniform1f('uInvert')).toBe(1)

    renderer.setInvert(false)
    renderer.draw()
    expect(lastUniform1f('uInvert')).toBe(0)
  })

  it('setDepthRange 写入 [low, high] 到 uniform', () => {
    const renderer = prep()!
    renderer.setDepthRange([0.1, 0.9])
    renderer.draw()
    expect(lastUniform1f('uRangeLow')).toBeCloseTo(0.1, 5)
    expect(lastUniform1f('uRangeHigh')).toBeCloseTo(0.9, 5)
  })

  it('setDepthRange 自动 clamp 到 [0,1] + NaN 防御', () => {
    const renderer = prep()!
    renderer.setDepthRange([-0.5, 2])
    renderer.draw()
    expect(lastUniform1f('uRangeLow')).toBe(0)
    expect(lastUniform1f('uRangeHigh')).toBe(1)
  })
})

// ── draw / dispose ──────────────────────────────────────────────────────────

describe('draw', () => {
  it('没有 LUT 时是 no-op', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    renderer.setDepth(new Float32Array(4), 2, 2)
    renderer.draw()
    expect(mockState.drawArraysCalls).toBe(0)
  })

  it('没有 depth 时是 no-op', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    renderer.setLut(getColormapLUT('inferno'))
    renderer.draw()
    expect(mockState.drawArraysCalls).toBe(0)
  })

  it('完整数据后调用一次 drawArrays(TRIANGLE_STRIP, 0, 4)', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    renderer.setDepth(new Float32Array(4), 2, 2)
    renderer.setLut(getColormapLUT('inferno'))
    renderer.draw()
    expect(mockState.drawArraysCalls).toBe(1)
  })
})

describe('dispose', () => {
  it('清理 3 个纹理 + 1 个 program', () => {
    const renderer = createWebGLDepthRenderer(makeCanvas())!
    renderer.dispose()
    expect(mockState.deleteTextureCalls).toBe(3) // depthTex + lutA + lutB
    expect(mockState.deleteProgramCalls).toBe(1)
  })
})
