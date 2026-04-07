/**
 * components/viewport/Viewport.tsx — 100vw × 100vh 状态机容器
 *
 * DESIGN.md §6.4 明确列为"手写"组件: 纯状态调度, 无视觉布局.
 *
 * 职责 (component 层 — 纯渲染 + 状态分发):
 *   - 占据 100vw × 100vh (DESIGN.md §4 布局)
 *   - 套 .viewport class (globals.css line 205) — 自带 --bg-primary 背景 +
 *     radial-gradient vignette 暗角 (DESIGN.md §3.4)
 *   - 根据 depthStore 状态调度子组件:
 *     ┌──────────────────────────────────────┐
 *     │ depthMap === null && !isProcessing   │ → <EmptyState />
 *     │ isProcessing (首帧, 无结果)          │ → <EmptyState /> + <ScanlineLoader />
 *     │ depthMap !== null                    │ → <DepthCanvas2D />
 *     │ isProcessing (重新推理, 有旧结果)    │ → <DepthCanvas2D /> + <ScanlineLoader />
 *     └──────────────────────────────────────┘
 *
 * 状态机设计原则:
 *   - 只订阅 depthStore 的两个字段 (depthMap 引用, isProcessing 布尔)
 *   - 不做异步、不调 API — 推理流程全部在 hooks/useDepthEstimation
 *   - EmptyState 和 DepthCanvas2D 不互斥显示规则: 有旧结果时保留, 新推理时在
 *     上面叠扫描线 (避免"推理中短暂白屏"的坏体验)
 *
 * **cursor**: DESIGN.md §4 规定 viewport 使用自定义十字准线 SVG 光标.
 *   Phase 1 先用系统 crosshair, Phase 2 再替换 SVG 资源.
 *
 * **z-index**: z-0 (最底层, DESIGN.md §9), 所有其他 UI 浮在上面.
 *
 * **架构合规**:
 *   - 不 import services/ ✓
 *   - 只订阅 store + 分发子组件 ✓
 *   - 不含业务编排 ✓
 */
import { useDepthStore } from '../../stores/depthStore'
import { DepthCanvas2D } from './DepthCanvas2D'
import { EmptyState } from './EmptyState'
import { ScanlineLoader } from './ScanlineLoader'

// ── 组件 ────────────────────────────────────────────────────────────────────

export function Viewport() {
  // 只订阅需要的字段. zustand 会做 shallow compare, 其他字段变化不触发重渲.
  const depthMap = useDepthStore((s) => s.depthMap)
  const isProcessing = useDepthStore((s) => s.isProcessing)

  // 状态推导 — 单一真相源, 避免在 JSX 里散落 ternary.
  const hasResult = depthMap !== null
  const showEmpty = !hasResult && !isProcessing

  return (
    <div
      // .viewport class 来自 globals.css @layer components (line 205):
      //   position: relative; width: 100vw; height: 100vh;
      //   background: var(--bg-primary); overflow: hidden;
      // 并自带 ::after vignette 暗角.
      //
      // cursor: crosshair — Phase 2 会换成自定义 SVG (DESIGN.md §4)
      className="viewport"
      style={{
        cursor: 'crosshair',
      }}
      role="main"
      aria-label="深度可视化区域"
    >
      {/* 有结果 → 渲染深度图 canvas (带 focus-reveal 动画) */}
      {hasResult && <DepthCanvas2D />}

      {/* 没结果且没在推理 → 空状态引导 */}
      {showEmpty && <EmptyState />}

      {/* 推理中 → 扫描线叠加 (叠在任何底层之上) */}
      {isProcessing && <ScanlineLoader />}
    </div>
  )
}
