/**
 * __fixtures__/mockWebGL.ts — 共享的 WebGL2 mock 工具
 *
 * happy-dom 不实现 WebGL2, canvas.getContext('webgl2') 默认返回 null.
 * 测试通过本模块的 monkey-patch 注入 mock context, 验证 webglDepth.ts
 * 的 JS 控制流和 WebGL API 调用顺序.
 *
 * 拆出原因 (CLAUDE.md ≤ 300 行硬约束): 单个 webglDepth.test.ts 文件容纳
 * mock + 全部测试会超过 450 行, 与 layout_smoke.test.tsx 相似. 把 mock
 * 拆出复用, 让主测试文件聚焦在断言上.
 */
import { vi } from 'vitest'

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface MockGlState {
  shaderCompileStatus: boolean
  programLinkStatus: boolean
  texImage2DCalls: Array<{
    target: number
    level: number
    internalformat: number
    width: number
    height: number
    format: number
    type: number
    pixels: ArrayBufferView | null
  }>
  uniform1fCalls: Array<{ location: object; value: number }>
  uniform1iCalls: Array<{ location: object; value: number }>
  drawArraysCalls: number
  deleteTextureCalls: number
  deleteProgramCalls: number
}

/** 创建一个干净的 mock state, beforeEach 中调用 */
export function createMockState(): MockGlState {
  return {
    shaderCompileStatus: true,
    programLinkStatus: true,
    texImage2DCalls: [],
    uniform1fCalls: [],
    uniform1iCalls: [],
    drawArraysCalls: 0,
    deleteTextureCalls: 0,
    deleteProgramCalls: 0,
  }
}

// ── mock context 工厂 ──────────────────────────────────────────────────────

/**
 * 最小可用的 WebGL2 mock — 只实现 createWebGLDepthRenderer 用到的方法.
 * 所有 createXxx / getXxx 返回唯一对象 (用 __tag 区分), 便于测试断言.
 */
export function createMockGl(state: MockGlState): WebGL2RenderingContext {
  const uniformLocs: Record<string, object> = {}
  const program = { __tag: 'program' }
  let texCounter = 0
  let shaderCounter = 0

  const gl = {
    // 常量 — 仅列出我们用到的
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    R32F: 0x822e,
    RED: 0x1903,
    FLOAT: 0x1406,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE2: 0x84c2,
    TRIANGLE_STRIP: 0x0005,
    COLOR_BUFFER_BIT: 0x4000,

    // shader / program
    createShader: vi.fn(() => ({ __tag: `shader${shaderCounter++}` })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => state.shaderCompileStatus),
    getShaderInfoLog: vi.fn(() => 'mock shader info log'),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => program),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => state.programLinkStatus),
    getProgramInfoLog: vi.fn(() => 'mock program info log'),
    deleteProgram: vi.fn(() => {
      state.deleteProgramCalls++
    }),
    useProgram: vi.fn(),

    // uniform
    getUniformLocation: vi.fn((_p: object, name: string) => {
      if (!uniformLocs[name]) uniformLocs[name] = { __tag: `uniform_${name}` }
      return uniformLocs[name]
    }),
    uniform1i: vi.fn((loc: object, value: number) => {
      state.uniform1iCalls.push({ location: loc, value })
    }),
    uniform1f: vi.fn((loc: object, value: number) => {
      state.uniform1fCalls.push({ location: loc, value })
    }),

    // texture
    createTexture: vi.fn(() => ({ __tag: `tex${texCounter++}` })),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(
      (
        target: number,
        level: number,
        internalformat: number,
        width: number,
        height: number,
        _border: number,
        format: number,
        type: number,
        pixels: ArrayBufferView | null
      ) => {
        state.texImage2DCalls.push({
          target,
          level,
          internalformat,
          width,
          height,
          format,
          type,
          pixels,
        })
      }
    ),
    activeTexture: vi.fn(),
    deleteTexture: vi.fn(() => {
      state.deleteTextureCalls++
    }),

    // draw
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn(() => {
      state.drawArraysCalls++
    }),
  }

  return gl as unknown as WebGL2RenderingContext
}

// ── monkey-patch helper ────────────────────────────────────────────────────

/**
 * 临时替换 HTMLCanvasElement.prototype.getContext, 让 'webgl2' 返回提供的
 * mock. 返回一个 restore 函数 (在 afterEach 中调用恢复原状).
 *
 * 用法:
 * ```ts
 * let restore: () => void
 * beforeEach(() => {
 *   const state = createMockState()
 *   const gl = createMockGl(state)
 *   restore = patchCanvasGetContext(() => gl)
 * })
 * afterEach(() => restore())
 * ```
 */
export function patchCanvasGetContext(
  glFactory: () => WebGL2RenderingContext | null
): () => void {
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (
    contextId: string,
    ..._args: unknown[]
  ): unknown {
    if (contextId === 'webgl2') return glFactory()
    return null
  } as typeof HTMLCanvasElement.prototype.getContext
  return () => {
    HTMLCanvasElement.prototype.getContext = original
  }
}
