/**
 * lib/webglDepth.shaders.ts — WebGL2 深度渲染器的 shader 源 + 编译辅助
 *
 * 从 webglDepth.ts 拆出来 (CLAUDE.md ≤ 300 行硬约束). 本模块只关心:
 *   1. 顶点 + 片元 shader 源字符串
 *   2. 通用的 compileShader / linkProgram 辅助 (失败抛带 InfoLog 的 Error)
 *
 * 工厂函数 createWebGLDepthRenderer 在 webglDepth.ts 引用本模块的导出.
 *
 * 架构合规 (CLAUDE.md):
 *   - lib/ 层零外部依赖 ✓ — 只用浏览器原生 WebGL2 API
 */

// ── 顶点 shader ────────────────────────────────────────────────────────────

/**
 * 全屏 quad. 不使用 attribute, 直接由 gl_VertexID 算坐标 (4 顶点 trianglestrip),
 * 这样不需要绑 VBO / VAO, 减少 boilerplate.
 *
 * UV y 翻转: WebGL 纹理 y=0 在底, 而我们把图像 row 0 上传到 y=0,
 * 期望 row 0 显示在屏幕顶部.
 */
export const VERT_SRC = `#version 300 es
out vec2 vUv;
void main() {
  vec2 pos = vec2(
    (gl_VertexID & 1) == 0 ? -1.0 : 1.0,
    (gl_VertexID & 2) == 0 ? -1.0 : 1.0
  );
  vUv = vec2(pos.x * 0.5 + 0.5, 1.0 - (pos.y * 0.5 + 0.5));
  gl_Position = vec4(pos, 0.0, 1.0);
}
`

// ── 片元 shader ────────────────────────────────────────────────────────────

/**
 * 流程:
 *   1. 采样 R32F 深度纹理 (单通道, [0,1])
 *   2. depthRange 裁剪 + 重映射到 [0,1]
 *   3. invertDepth (mix(d, 1-d, uInvert))
 *   4. 双 LUT (256x1 RGBA) 采样, 按 uLutMix 混合 (0=旧 1=新)
 *   5. 乘以 uBreath 实现呼吸亮度
 */
export const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uDepth;
uniform sampler2D uLutA;     // 当前 LUT (morph 终点)
uniform sampler2D uLutB;     // 上一个 LUT (morph 起点)
uniform float uLutMix;       // 0..1, 0=B 1=A
uniform float uBreath;       // 亮度乘数 ~1.0 ±0.02
uniform float uInvert;       // 0 或 1
uniform float uRangeLow;     // [0,1]
uniform float uRangeHigh;    // [0,1], > uRangeLow

void main() {
  float d = texture(uDepth, vUv).r;

  float span = max(uRangeHigh - uRangeLow, 1e-6);
  d = clamp((d - uRangeLow) / span, 0.0, 1.0);

  d = mix(d, 1.0 - d, uInvert);

  vec2 lutCoord = vec2(d, 0.5);
  vec3 colA = texture(uLutA, lutCoord).rgb;
  vec3 colB = texture(uLutB, lutCoord).rgb;

  vec3 col = mix(colB, colA, clamp(uLutMix, 0.0, 1.0));
  col *= uBreath;

  outColor = vec4(col, 1.0);
}
`

// ── 编译 + 链接辅助 ────────────────────────────────────────────────────────

/** 编译单个 shader, 失败抛带 InfoLog 的 Error */
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('createShader 返回 null')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(no info log)'
    gl.deleteShader(shader)
    throw new Error(`shader 编译失败: ${log}`)
  }
  return shader
}

/** 链接 program, 失败抛带 InfoLog 的 Error */
export function linkProgram(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader
): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error('createProgram 返回 null')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '(no info log)'
    gl.deleteProgram(program)
    throw new Error(`program 链接失败: ${log}`)
  }
  return program
}
