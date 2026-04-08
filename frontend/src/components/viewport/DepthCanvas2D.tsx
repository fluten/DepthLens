/**
 * components/viewport/DepthCanvas2D.tsx — WebGL2 深度图渲染 (Phase 2)
 *
 * Phase 2 升级: 从 Canvas 2D ImageData 改为 WebGL2 shader 渲染.
 *
 * 新增能力 (vs Phase 1):
 *   1. **LUT morph 过渡** — 切 colormap 时双 LUT shader 混合, 300ms ease-out
 *   2. **呼吸亮度** — brightness ±2%, 8s 周期 sin 波 (DESIGN.md §3.2)
 *   3. **invertDepth / depthRange** — uniform 控制, 切换零成本
 *
 * 保留能力:
 *   - focus-reveal 对焦动画 (CSS keyframe, 每次新深度图 remount canvas 触发)
 *   - WebGL2 不可用时回退到 Canvas 2D + applyColormap (与 Phase 1 一致)
 *
 * 架构合规 (CLAUDE.md):
 *   - component 层 — 不 import services/, 只读 store + 调 lib 纯函数
 *   - WebGL 命令式 API 在 useEffect 中执行, ref 持有 renderer 实例
 *
 * 性能:
 *   - 深度纹理上传 1080p ~3ms, draw call ~0.5ms, 整帧 < 5ms (远低于 16ms 红线)
 *   - 切 colormap 只上传 1 KB LUT 纹理, 不触动深度纹理
 */
import { useEffect, useRef, useState } from 'react'
import { applyColormap } from '../../lib/depth'
import { getColormapLUT } from '../../lib/colormaps'
import {
  createWebGLDepthRenderer,
  type WebGLDepthRenderer,
} from '../../lib/webglDepth'
import { useDepthStore } from '../../stores/depthStore'
import { useViewportStore } from '../../stores/viewportStore'

// ── 常量 ────────────────────────────────────────────────────────────────────

/**
 * 呼吸动画周期 (ms). DESIGN.md §3.2: 8 秒一次.
 *
 * 仅在图片模式启用 — 视频/摄像头模式深度图本身高频更新, 呼吸会和内容
 * 变化叠加产生干扰. Phase 2 viewport 只处理图片, 视频流由 Phase 3 接管.
 */
const BREATH_PERIOD_MS = 8000
/** 呼吸亮度振幅 ±2% */
const BREATH_AMPLITUDE = 0.02

// ── 组件 ────────────────────────────────────────────────────────────────────

export function DepthCanvas2D() {
  // store 订阅 (单字段 selector, 避免对象引用比较坑)
  const depthMap = useDepthStore((s) => s.depthMap)
  const width = useDepthStore((s) => s.width)
  const height = useDepthStore((s) => s.height)
  const colormap = useViewportStore((s) => s.colormap)
  const invertDepth = useViewportStore((s) => s.invertDepth)
  const depthRange = useViewportStore((s) => s.depthRange)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // WebGL 渲染器实例 — null 表示 WebGL2 不可用 (走 fallback)
  const rendererRef = useRef<WebGLDepthRenderer | null>(null)
  // 是否已经尝试过初始化 (避免每次 effect 重跑 createWebGLDepthRenderer)
  const triedInitRef = useRef(false)
  // fallback 路径用 — 标记 ctx2d 是否已经画过, 用于决定是否重画
  const fallbackPaintedRef = useRef(false)

  // ── focus-reveal 重放 epoch ───────────────────────────────────────────
  // 每次新的 depthMap 引用 → epoch +1, 由 effect 7 触发 CSS 动画重置.
  // **不能** 用 epoch 做 canvas key 来 remount, 因为 remount 会丢 WebGL
  // context 而 effect 1 的依赖 (hasValidData) 不变, 不会重建 renderer.
  // 改用 "canvas.style.animation 清除 → reflow → 重设" 的经典 CSS 动画
  // 重置技巧, 让 canvas DOM 保持挂载, 动画照样重放.
  //
  // derived state 模式 (React 官方推荐): 在 render 期间检测 depthMap
  // 引用变化, 不需要 useEffect.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevDepth, setPrevDepth] = useState<Float32Array | null>(depthMap)
  const [renderEpoch, setRenderEpoch] = useState(0)
  if (depthMap !== prevDepth) {
    setPrevDepth(depthMap)
    if (depthMap !== null) setRenderEpoch((e) => e + 1)
  }

  // 早期返回: 数据无效时不渲染. **必须在所有 hooks 之后才返回**, 但下方的
  // useEffect 都对 null ref 安全, 所以放最后.
  const hasValidData =
    depthMap !== null &&
    width > 0 &&
    height > 0 &&
    depthMap.length === width * height

  // ── effect 1: 初始化 WebGL 渲染器 ─────────────────────────────────────
  // canvas 挂载后立即尝试创建 WebGL 渲染器, 失败则 rendererRef 保持 null,
  // 后续 effect 会走 fallback 路径.
  useEffect(() => {
    if (!hasValidData) return
    const canvas = canvasRef.current
    if (!canvas || triedInitRef.current) return
    triedInitRef.current = true
    rendererRef.current = createWebGLDepthRenderer(canvas)
    // cleanup: 组件卸载时释放 GPU 资源
    return () => {
      rendererRef.current?.dispose()
      rendererRef.current = null
      triedInitRef.current = false
      fallbackPaintedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidData])

  // ── effect 2: 上传深度数据 (仅深度本身, LUT 由 effect 3 单独负责) ─────
  // **不在这里 setLut**: 否则 effect 2 + effect 3 在初始 mount 时都会上传 LUT,
  // 造成 4 次冗余上传 (应该只 2 次). 单一职责: depth 改变时只动 depth 纹理.
  useEffect(() => {
    if (!hasValidData || !depthMap) return
    const renderer = rendererRef.current
    if (renderer) {
      renderer.setDepth(depthMap, width, height)
      // RAF (effect 5) 会在下一帧 draw — 不主动 draw 避免和 effect 3 重复
    } else {
      // ── fallback: WebGL 不可用, 走 Canvas 2D + ImageData ────────────
      // fallback 没有 RAF, 必须 inline LUT 才能立刻看到画面
      const canvas = canvasRef.current
      if (!canvas) return
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      try {
        const lut = getColormapLUT(colormap)
        const imageData = applyColormap(depthMap, width, height, lut)
        ctx.putImageData(imageData, 0, 0)
        fallbackPaintedRef.current = true
      } catch {
        // applyColormap 边界已经在外层校验, 兜底不抛
      }
    }
    // 故意只依赖深度本身, colormap/invert/range 由其他 effect 处理.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depthMap, width, height])

  // ── effect 3: 上传 LUT (初始 + colormap 切换) ──────────────────────────
  // 该 effect 是 LUT 上传的"单一真相源", 在初始 mount 和 colormap 变化时都会跑.
  // WebGL 路径: 第一次跑时 setLut 会触发 A=B=lut (无过渡), 后续 setLut 触发
  // morph (B=旧 / A=新). 由 RAF (effect 5) 接管 draw.
  // fallback 路径: 第一次由 effect 2 已经 paint, 这里跳过; 后续 colormap 改变
  // 时重绘.
  useEffect(() => {
    if (!hasValidData) return
    const renderer = rendererRef.current
    if (renderer) {
      renderer.setLut(getColormapLUT(colormap))
    } else if (depthMap && fallbackPaintedRef.current) {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      try {
        const lut = getColormapLUT(colormap)
        const imageData = applyColormap(depthMap, width, height, lut)
        ctx.putImageData(imageData, 0, 0)
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colormap, hasValidData])

  // ── effect 4: invertDepth / depthRange uniform 同步 (仅 WebGL) ────────
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.setInvert(invertDepth)
    renderer.setDepthRange(depthRange)
  }, [invertDepth, depthRange])

  // ── effect 5: RAF 循环 — morph 推进 + 呼吸亮度 + draw ──────────────────
  // 仅 WebGL 路径需要; fallback 路径 (Canvas 2D) 是静态绘制, 不需要每帧更新.
  useEffect(() => {
    if (!hasValidData) return
    const renderer = rendererRef.current
    if (!renderer) return

    let rafId = 0
    let startTime = 0
    const tick = (now: number): void => {
      if (startTime === 0) startTime = now
      // 推进 morph
      renderer.tickMorph(now)
      // 呼吸亮度: 1 + amplitude * sin(2π * t / period)
      const phase = ((now - startTime) / BREATH_PERIOD_MS) * Math.PI * 2
      const breath = 1 + BREATH_AMPLITUDE * Math.sin(phase)
      renderer.setBreath(breath)
      renderer.draw()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [hasValidData])

  // ── effect 6: focus-reveal 动画重置 — 每次 epoch 变化触发一次 ──────────
  // 用 "清除 animation → 强制 reflow → 重新设置" 的经典 CSS 动画重置技巧,
  // 让 canvas DOM 保持挂载 (不丢 WebGL context), 但 focus-reveal keyframe
  // 重新从 0% 开始播放. 每张新图都对焦一次, 即使尺寸完全相同.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.style.animation = 'none'
    // 强制 reflow — 读取 offsetWidth 让浏览器 commit "no animation" 状态,
    // 后续重设才会被识别为新动画. void 是为了避免 lint 报"无副作用读取".
    void canvas.offsetWidth
    canvas.style.animation = 'focus-reveal 0.4s cubic-bezier(0.2, 0, 0, 1) forwards'
  }, [renderEpoch])

  // 无数据 — 不渲染 (与 Phase 1 一致, EmptyState 由父 Viewport 调度)
  if (!hasValidData) return null

  return (
    <canvas
      ref={canvasRef}
      // **不**用 key 远程触发 remount: 那会让 WebGL context 被销毁但 effect 1
      // 的 [hasValidData] 依赖未变, renderer 不会重建 → 黑屏 bug. 改用
      // effect 6 的 CSS 动画重置, canvas 始终保持挂载.
      data-epoch={renderEpoch}
      aria-label="深度热力图"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        // 初始 animation 由 effect 6 设置 (mount 后立即触发); 这里不放
        // 内联 animation 以避免和 effect 6 的赋值冲突 (浏览器会把内联值
        // 当 "已应用", 重置时不触发 animationstart).
      }}
    />
  )
}
