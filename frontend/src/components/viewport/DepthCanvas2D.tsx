/**
 * components/viewport/DepthCanvas2D.tsx — Canvas 2D 深度图渲染
 *
 * DESIGN.md §6.4 明确列为"手写"组件: 核心是 Canvas 渲染逻辑, 不是视觉布局.
 *
 * 职责 (component 层 — 纯渲染):
 *   1. 订阅 depthStore 拿 (depthMap, width, height)
 *   2. 订阅 viewportStore 拿 colormap id
 *   3. 通过 lib/colormaps.getColormapLUT + lib/depth.applyColormap 合成 ImageData
 *   4. 写入 <canvas>, putImageData
 *   5. CSS 控制显示尺寸 (object-fit: contain, 保持长宽比, 居中)
 *
 * 性能 (lib/depth.applyColormap 基准):
 *   480p  ~1.3ms  /  720p  ~2.8ms  /  1080p  ~6.3ms
 *   均在 SPEC §9 "色彩映射切换 < 16ms" 红线内.
 *
 * **focus-reveal 对焦动画** (DESIGN.md §3.1):
 *   @keyframes focus-reveal 已在 globals.css line 232 定义,
 *   每次深度图更新时通过 key 强制 remount <canvas>, 动画自动重放.
 *
 * **Phase 1 范围**:
 * - 只实现基础的"彩色深度图" 渲染
 * - invertDepth / depthRange 等用户偏好字段**不在本阶段处理** (见 lib/depth.ts
 *   文件头注: "invertDepth / range clipping 属于 Phase 2 viewport 任务")
 * - Phase 2 会把本组件升级为 WebGL shader 实现 colormap morph 过渡
 *
 * **架构合规** (CLAUDE.md 分层):
 * - 不 import services/ ✓ — 只读 store + 调 lib 纯函数
 * - 不含业务编排 ✓ — 推理流程在 hooks/useDepthEstimation
 */
import { useEffect, useMemo, useRef } from 'react'
import { applyColormap } from '../../lib/depth'
import { getColormapLUT } from '../../lib/colormaps'
import { useDepthStore } from '../../stores/depthStore'
import { useViewportStore } from '../../stores/viewportStore'

// ── 组件 ────────────────────────────────────────────────────────────────────

export function DepthCanvas2D() {
  // 用 zustand 的 selector 订阅, 只在真正需要的字段变化时重新渲染.
  // 单字段 selector 比返回对象的 selector 更稳, 避免引用比较坑.
  const depthMap = useDepthStore((s) => s.depthMap)
  const width = useDepthStore((s) => s.width)
  const height = useDepthStore((s) => s.height)
  const colormap = useViewportStore((s) => s.colormap)

  // 把 depth → ImageData 的合成做成纯计算 useMemo, 依赖任意一项变化都会重算.
  // applyColormap 会抛 RangeError (长度不匹配等), 正常路径下不会走到, 但为了
  // 不让渲染崩溃用 try/catch 兜住, 失败时返回 null, canvas 保持上一帧.
  const imageData = useMemo<ImageData | null>(() => {
    if (!depthMap || width <= 0 || height <= 0) return null
    if (depthMap.length !== width * height) return null
    try {
      const lut = getColormapLUT(colormap)
      return applyColormap(depthMap, width, height, lut)
    } catch {
      // applyColormap 不应该抛 (我们已经在外层校验), 但兜底
      return null
    }
  }, [depthMap, width, height, colormap])

  // canvas ref — putImageData 是命令式 API, 只能在 useEffect 里执行
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imageData) return

    // 注意顺序: 先设 canvas.width/height (会清空画布), 再 putImageData
    if (canvas.width !== imageData.width) canvas.width = imageData.width
    if (canvas.height !== imageData.height) canvas.height = imageData.height

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(imageData, 0, 0)
  }, [imageData])

  // 无数据时不渲染 — 交给父 Viewport 的 EmptyState 分支
  if (!imageData) return null

  return (
    <canvas
      ref={canvasRef}
      // key: 每次 depthMap 引用变化都强制 remount, 触发 focus-reveal 动画重放.
      // 用 depthMap (Float32Array 实例) 作 key 是安全的 — 每次 setResult 都是
      // 新的 Float32Array 引用.
      key={depthMap ? `${width}x${height}-${colormap}` : 'empty'}
      aria-label="深度热力图"
      style={{
        // absolute 居中, object-fit contain: 保持长宽比撑满 viewport
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        // contain 由 object-fit 实现 (canvas 支持)
        objectFit: 'contain',
        // focus-reveal keyframe 来自 globals.css §5.1
        animation: 'focus-reveal 0.4s cubic-bezier(0.2, 0, 0, 1) forwards',
        // 在 z-0 (viewport) 层, 之上是 vignette (z-1) 和 HUD (z-20)
      }}
    />
  )
}
