/**
 * components/ui/GlassPanel.tsx — 三级玻璃面板原子组件
 *
 * DepthLens 最核心的视觉语言 (DESIGN.md §2). 所有浮在画面上的 UI 必须
 * 通过这个组件套对应的玻璃 class, 而不是各自重复写 backdrop-filter /
 * box-shadow / inset 光边 等样板.
 *
 * 玻璃 class 已在 styles/globals.css 里按 DESIGN.md §2 像素级调好:
 *   .glass-heavy  → SettingsSheet, Toast    (blur 40px, opacity 0.78)
 *   .glass-medium → HUD, ConnectionBar      (blur 24px, opacity 0.55)
 *   .glass-light  → Tooltip, Shutter base   (blur 12px, opacity 0.35)
 *
 * 设计:
 * - 这是一个 *纯* 包装组件 — 不含任何业务逻辑, 不订阅 store, 不调 hook.
 *   它的全部职责就是把 variant prop 翻译成对应的 class 名再加给 div.
 * - forwardRef 转发, 让 Framer Motion 等需要 ref 的库可以挂上.
 * - className 透传 + 拼接, 调用方可以叠加 layout 样式 (例如 fixed 定位).
 *   但**不应该**叠加任何会破坏玻璃外观的样式 (如 background, blur).
 * - 不接受 'as' prop / polymorphic — 玻璃永远是 div, 简单可控.
 *
 * **禁止** (DESIGN.md §2 玻璃面板 Checklist):
 * - 不要嵌套 GlassPanel (玻璃叠玻璃会让 backdrop-filter 失真)
 * - 不要往 className 加 background-color (会盖掉玻璃半透明)
 * - 不要往 className 加 noise/grain texture
 * - 圆角不要小于 6px (variant 自带的圆角已 ≥ 6px, 别用 className 强行覆盖)
 */
import { forwardRef, type HTMLAttributes } from 'react'

// ── 类型 ────────────────────────────────────────────────────────────────────

/** 玻璃面板的视觉级别. 与 DESIGN.md §2 玻璃分配表一一对应. */
export type GlassVariant = 'heavy' | 'medium' | 'light'

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** 玻璃级别. 必填 — 没有"默认"是为了强迫调用方明确视觉意图. */
  variant: GlassVariant
}

// ── 内部: variant → CSS class 映射 ──────────────────────────────────────────

/**
 * 写成 const Record 而非 switch, 让 ts 能在编译期穷尽检查 variant.
 * 新增 variant 时如果忘了加映射, ts 会报错.
 */
const VARIANT_CLASS: Record<GlassVariant, string> = {
  heavy: 'glass-heavy',
  medium: 'glass-medium',
  light: 'glass-light',
}

// ── 组件 ────────────────────────────────────────────────────────────────────

/**
 * 三级玻璃面板. 见文件头注释.
 *
 * @example
 *   // Toast 容器 (heavy 玻璃)
 *   <GlassPanel variant="heavy" className="fixed top-4 left-1/2 -translate-x-1/2">
 *     <ToastBody />
 *   </GlassPanel>
 *
 *   // HUD 数据面板 (medium 玻璃)
 *   <GlassPanel variant="medium" className="fixed top-4 left-4 px-3 py-2">
 *     <FpsRow />
 *   </GlassPanel>
 */
export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  function GlassPanel({ variant, className, children, ...rest }, ref) {
    // class 拼接: variant 自带的玻璃 class 永远在前, 调用方的 className 在后,
    // 这样调用方可以加 layout 类 (fixed/flex/padding) 但**不能**用更高优先
    // 级的 background 等样式覆盖玻璃 — Tailwind 的 layer 顺序保证 components
    // 层 (.glass-*) 优先级低于 utility 层, 所以叠加 utility 是安全的.
    const cls = className
      ? `${VARIANT_CLASS[variant]} ${className}`
      : VARIANT_CLASS[variant]

    return (
      <div ref={ref} className={cls} {...rest}>
        {children}
      </div>
    )
  }
)
