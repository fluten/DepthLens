/**
 * lib/webglDepth.ts — WebGL2 深度图渲染器工厂 (Phase 2)
 *
 * 把 [0,1] float32 深度图通过两套 LUT 渲染到 <canvas>, 同时支持:
 *   1. **LUT morph 过渡** — setLut() 时把"当前 LUT" 作为旧 LUT (texB),
 *      新 LUT 作为新 LUT (texA), 在 300ms 内 ease-out 插值. 由 tickMorph(now)
 *      驱动, 不在内部启动 RAF (调用方负责调度), 这样组件层可以把 morph + 呼吸
 *      合并到一个 RAF 循环.
 *   2. **呼吸亮度** — setBreath(value) 把整体颜色 ×value, 由调用方按
 *      ±2% / 8s 周期更新.
 *   3. **invertDepth / depthRange** — uniform 控制, 切换不需要重传深度纹理.
 *
 * 与 lib/depth.applyColormap 的关系:
 *   - applyColormap 是 CPU 端 fallback (无 WebGL2 时仍可渲染)
 *   - 本模块是 GPU 端实现, 支持 morph + breath, applyColormap 不支持
 *
 * 架构合规 (CLAUDE.md):
 *   - lib/ 层零外部依赖 ✓ — 只用浏览器原生 WebGL2 API
 *   - shader 源 + 编译辅助拆到 webglDepth.shaders.ts (≤ 300 行硬约束)
 */
import {
  VERT_SRC,
  FRAG_SRC,
  compileShader,
  linkProgram,
} from './webglDepth.shaders'

// ── 公共类型 ────────────────────────────────────────────────────────────────

/** 渲染器对外接口 — 命令式 API, 由 React 组件包裹 */
export interface WebGLDepthRenderer {
  /** 已上传深度图的宽 (像素), 0 表示尚未上传 */
  readonly width: number
  /** 已上传深度图的高 */
  readonly height: number
  /** 当前 morph 进度 (0..1). 用于测试或调试, 业务代码不应依赖. */
  readonly morphProgress: number

  /**
   * 上传新深度数据. 自动调整 canvas 像素尺寸 (CSS 尺寸由父布局决定).
   * @throws RangeError 当 depth.length !== width * height
   */
  setDepth(depth: Float32Array, width: number, height: number): void

  /**
   * 设置 colormap LUT (256*4 RGBA Uint8Array).
   * - 首次调用: A=B=lut, morph=1 (无过渡)
   * - 后续调用: B←旧 A, A←新 lut, morph=0 + 记录 morphStart
   *
   * @throws RangeError 当 lut.length !== 1024
   */
  setLut(lut: Uint8Array): void

  /** 呼吸亮度乘数 (建议范围 0.95..1.05). NaN 会被忽略保留上次值. */
  setBreath(value: number): void

  /** 设置 invertDepth (true → shader 中 1-d) */
  setInvert(value: boolean): void

  /** 设置深度范围裁剪 [low, high], 自动 clamp 到 [0,1] */
  setDepthRange(range: readonly [number, number]): void

  /**
   * 推进 morph 进度. 调用方每帧调用 (传入 performance.now()).
   * 已经到 1 的话是 no-op.
   */
  tickMorph(nowMs: number): void

  /** 提交一帧到 GPU. setDepth + setLut 之后才会真正绘制. */
  draw(): void

  /** 释放所有 GPU 资源. 调用后实例不可再用. */
  dispose(): void
}

// ── 工厂 ────────────────────────────────────────────────────────────────────

/**
 * 创建 WebGL2 渲染器. 失败 (浏览器不支持 / 编译错) 返回 null.
 *
 * 调用方应:
 * ```ts
 * const renderer = createWebGLDepthRenderer(canvas)
 * if (!renderer) {
 *   // 回退到 Canvas 2D + applyColormap
 * }
 * ```
 */
export function createWebGLDepthRenderer(
  canvas: HTMLCanvasElement
): WebGLDepthRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false, // 跳过 compositing 时的 alpha blend
    depth: false, // 不需要 depth buffer
    stencil: false,
    antialias: false, // 1:1 像素映射不需要 MSAA
    premultipliedAlpha: false, // 避免和 LUT 颜色相互污染
    preserveDrawingBuffer: false,
  }) as WebGL2RenderingContext | null

  if (!gl) return null

  // ── 编译 + 链接 ────────────────────────────────────────────────────────
  let program: WebGLProgram
  try {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
    program = linkProgram(gl, vs, fs)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
  } catch {
    return null
  }

  // ── uniform location 缓存 ─────────────────────────────────────────────
  const uDepth = gl.getUniformLocation(program, 'uDepth')
  const uLutA = gl.getUniformLocation(program, 'uLutA')
  const uLutB = gl.getUniformLocation(program, 'uLutB')
  const uLutMix = gl.getUniformLocation(program, 'uLutMix')
  const uBreath = gl.getUniformLocation(program, 'uBreath')
  const uInvert = gl.getUniformLocation(program, 'uInvert')
  const uRangeLow = gl.getUniformLocation(program, 'uRangeLow')
  const uRangeHigh = gl.getUniformLocation(program, 'uRangeHigh')

  // ── 纹理 ──────────────────────────────────────────────────────────────
  // 深度纹理 — R32F 不支持 LINEAR 过滤 (除非 OES_texture_float_linear), 用 NEAREST
  const depthTex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, depthTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  // LUT 纹理 — 256×1 RGBA8, LINEAR 获得平滑色带
  const makeLutTex = (): WebGLTexture => {
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }
  const lutTexA = makeLutTex()
  const lutTexB = makeLutTex()

  // ── 内部状态 ──────────────────────────────────────────────────────────
  // 当前缓存的 LUT — 我们在 JS 端缓存避免 FBO 拷贝
  let currentLutBytes: Uint8Array | null = null
  let hasInitialLut = false
  let depthW = 0
  let depthH = 0
  let breath = 1
  let invert = 0
  let rangeLow = 0
  let rangeHigh = 1
  let morphT = 1
  let morphStart = 0
  let morphActive = false

  const uploadLut = (tex: WebGLTexture, bytes: Uint8Array): void => {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
  }

  const nowMs = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now()

  // ── 渲染器对象 ────────────────────────────────────────────────────────
  const renderer: WebGLDepthRenderer = {
    get width() { return depthW },
    get height() { return depthH },
    get morphProgress() { return morphT },

    setDepth(depth, w, h) {
      if (depth.length !== w * h) {
        throw new RangeError(
          `setDepth: depth.length (${depth.length}) !== width*height (${w * h})`
        )
      }
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h

      gl.bindTexture(gl.TEXTURE_2D, depthTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, depth)
      depthW = w
      depthH = h
    },

    setLut(lut) {
      if (lut.length !== 256 * 4) {
        throw new RangeError(`setLut: lut.length (${lut.length}) !== 1024`)
      }
      if (!hasInitialLut) {
        // 首次: A=B=lut, 没有过渡
        uploadLut(lutTexA, lut)
        uploadLut(lutTexB, lut)
        currentLutBytes = lut
        hasInitialLut = true
        morphT = 1
        morphActive = false
      } else {
        // 后续: B←旧 (从 JS 缓存重传), A←新
        if (currentLutBytes) uploadLut(lutTexB, currentLutBytes)
        uploadLut(lutTexA, lut)
        currentLutBytes = lut
        morphT = 0
        morphStart = nowMs()
        morphActive = true
      }
    },

    setBreath(value) {
      if (Number.isFinite(value)) breath = value
    },

    setInvert(value) {
      invert = value ? 1 : 0
    },

    setDepthRange(range) {
      const lo = Number.isFinite(range[0]) ? range[0] : 0
      const hi = Number.isFinite(range[1]) ? range[1] : 1
      rangeLow = Math.max(0, Math.min(1, lo))
      rangeHigh = Math.max(0, Math.min(1, hi))
    },

    tickMorph(nowArg) {
      if (!morphActive) return
      const elapsed = nowArg - morphStart
      const t = elapsed >= 300 ? 1 : Math.max(0, elapsed) / 300
      // ease-out quad: t * (2 - t)
      morphT = t * (2 - t)
      if (t >= 1) {
        morphActive = false
        morphT = 1
      }
    },

    draw() {
      if (depthW === 0 || depthH === 0 || !hasInitialLut) return

      gl.viewport(0, 0, depthW, depthH)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, depthTex)
      gl.uniform1i(uDepth, 0)

      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, lutTexA)
      gl.uniform1i(uLutA, 1)

      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, lutTexB)
      gl.uniform1i(uLutB, 2)

      gl.uniform1f(uLutMix, morphT)
      gl.uniform1f(uBreath, breath)
      gl.uniform1f(uInvert, invert)
      gl.uniform1f(uRangeLow, rangeLow)
      gl.uniform1f(uRangeHigh, rangeHigh)

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },

    dispose() {
      gl.deleteTexture(depthTex)
      gl.deleteTexture(lutTexA)
      gl.deleteTexture(lutTexB)
      gl.deleteProgram(program)
    },
  }

  return renderer
}
