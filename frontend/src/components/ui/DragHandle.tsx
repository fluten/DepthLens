/**
 * components/ui/DragHandle.tsx — Sheet 顶部拖拽手柄
 *
 * 用途 (DESIGN.md §8 + DESIGN.md §6.4):
 * - 出现在 Settings Sheet 顶部, 视觉提示用户"这里可以下拉关闭/上拉展开"
 * - 是**纯装饰**, 实际拖拽手势绑在父级 Sheet 容器上 (Framer Motion drag),
 *   不在本组件里
 *
 * 尺寸 (DESIGN.md §8):
 *   宽 40px × 高 4px, radius-full, color = var(--text-tertiary) (#555570)
 *
 * 为什么不调 Stitch (DESIGN.md §6.4):
 *   "一个 40×4px 的灰色条" — 没有任何创意空间, 调 Stitch 会得到一堆要回退
 *   的代码, 比照 spec 直接写一行 div 反而最准.
 *
 * 可访问性:
 * - aria-hidden="true": 屏幕阅读器跳过这个纯视觉装饰. 真正的"关闭/打开"
 *   语义由父级 Sheet 容器以 button / dialog ARIA 暴露
 * - 不响应 pointer 事件 — pointer-events 仍然继承默认 (auto), 因为父级
 *   需要鼠标 hit-testing 才能开始 drag, 这里不阻断
 */
import { forwardRef, type HTMLAttributes } from 'react'

export interface DragHandleProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * 自定义 className. 通常不需要 — DragHandle 的尺寸和颜色都是固定的.
   * 唯一合理的覆盖场景是用 layout 类调位置 (例如 mx-auto 居中).
   */
  className?: string
}

// 基础样式 (DESIGN.md §8): 40×4px, 圆角, 灰色, 默认水平居中.
//
// 用 inline Tailwind class 而非自定义 CSS class —
//   - w-10 = 40px, h-1 = 4px (Tailwind 默认 4px 步进)
//   - rounded-full = radius 9999px ≥ 6px (满足 DESIGN.md 玻璃 checklist)
//   - bg-[var(--text-tertiary)] = #555570 (token 引用, 不硬编码)
//   - mx-auto = 父容器内水平居中 (Sheet 顶部典型用法)
const BASE_CLASS =
  'w-10 h-1 rounded-full bg-[var(--text-tertiary)] mx-auto'

export const DragHandle = forwardRef<HTMLDivElement, DragHandleProps>(
  function DragHandle({ className, ...rest }, ref) {
    const cls = className ? `${BASE_CLASS} ${className}` : BASE_CLASS
    return <div ref={ref} aria-hidden="true" className={cls} {...rest} />
  }
)
