/**
 * components/ui/Toast.tsx — 单条 Toast 视觉组件
 *
 * 视觉来源:
 *   - Stitch 生成 (project 9861093748484174395, screen "Stacked Toast Notifications")
 *   - 套 globals.css `.glass-heavy` (DESIGN.md §2 三档玻璃 heavy)
 *   - 4 种 variant 与 services/toast.ts ToastVariant 一一对齐
 *
 * 设计:
 * - 这是 *无状态* 的视觉组件 — 不订阅 toast service, 不管 auto-dismiss 计时
 *   计时和订阅都在 ToastContainer 里, Toast 只负责"长得对".
 * - severity bar (3px 左侧色条) + 同色 icon + 白字消息 + 灰色 X 关闭按钮
 *   布局完全还原 Stitch 设计稿
 * - 图标内嵌 SVG, 不依赖 lucide-react 等图标库 (避免版本绑定 + 减少 bundle)
 *
 * 不做 (拆给 ToastContainer):
 * - 入场 / 退场动画
 * - auto-dismiss 计时
 * - 订阅 toast service
 * - 多个 toast 的堆叠管理
 */
import { forwardRef, type HTMLAttributes } from 'react'
// 类型来自 lib/ (项目最底层), 不再 reach 到 services/.
// CLAUDE.md 分层规则: components 不得 import services, 但可以 import lib.
import type { ToastVariant } from '../../lib/toastTypes'

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  /** 严重级别. 与 services/toast.ts ToastVariant 一致. */
  variant: ToastVariant
  /** 显示文字. */
  message: string
  /** 关闭按钮回调. 不传则不渲染关闭按钮. */
  onClose?: () => void
}

// ── 内部: variant 配色映射 ────────────────────────────────────────────────
//
// 与 DESIGN.md §1 功能色 token 对齐:
//   --success #22C55E / --warning #F59E0B / --error #EF4444 / accent (info) #3B82F6

interface VariantStyle {
  /** 左侧色条 + 图标颜色 (CSS 变量名) */
  cssVar: string
  /** 屏幕阅读器 role: 'status' (低优先级 polite) 或 'alert' (高优先级 assertive) */
  ariaRole: 'status' | 'alert'
}

const VARIANT_STYLES: Record<ToastVariant, VariantStyle> = {
  success: { cssVar: 'var(--success)', ariaRole: 'status' },
  info: { cssVar: 'var(--accent)', ariaRole: 'status' },
  warning: { cssVar: 'var(--warning)', ariaRole: 'status' },
  // error 是阻断性通知, 用 'alert' 让屏幕阅读器立即朗读
  error: { cssVar: 'var(--error)', ariaRole: 'alert' },
}

// ── 内联 SVG 图标 ───────────────────────────────────────────────────────────
//
// 四个 16×16 stroke=2 lucide-style 图标. 自己内嵌避免依赖.
// currentColor 让父级 className 通过 color 控制颜色.

function SuccessIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

const VARIANT_ICONS: Record<ToastVariant, () => React.JSX.Element> = {
  success: SuccessIcon,
  info: InfoIcon,
  warning: WarningIcon,
  error: ErrorIcon,
}

// ── 组件 ────────────────────────────────────────────────────────────────────

export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast(
  { variant, message, onClose, className, ...rest },
  ref
) {
  const styles = VARIANT_STYLES[variant]
  const Icon = VARIANT_ICONS[variant]

  // 拼接 className: 基础 layout + glass-heavy + 调用方扩展
  // - relative: 让 severity bar 用 absolute 定位
  // - flex items-center: 横向布局, 图标和文字垂直居中
  // - rounded-[var(--radius-toast)] = 12px (DESIGN.md §2 Toast 例外, 在 globals.css token 化)
  // - w-full: 填满父容器 (ToastContainer 控制 max-width 480px, DESIGN.md §8)
  // - min-h-[52px]: 与 Stitch 设计一致, 长消息可换行更高
  // - pl-6 = 24px 左 padding, 给 3px severity bar + 12px gap + icon 留位
  // - pr-4 = 16px 右 padding
  const baseClass =
    'glass-heavy relative flex items-center w-full min-h-[52px] pl-6 pr-4 rounded-[var(--radius-toast)] overflow-hidden'
  const cls = className ? `${baseClass} ${className}` : baseClass

  return (
    <div
      ref={ref}
      role={styles.ariaRole}
      aria-live={styles.ariaRole === 'alert' ? 'assertive' : 'polite'}
      className={cls}
      {...rest}
    >
      {/* 左侧 3px 色条, 跨整个高度, 左上左下圆角 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[3px]"
        style={{ backgroundColor: styles.cssVar }}
        aria-hidden="true"
      />

      {/* 严重级别图标 */}
      <span
        className="flex items-center justify-center mr-3"
        style={{ color: styles.cssVar }}
      >
        <Icon />
      </span>

      {/* 消息文字 */}
      <span className="flex-1 text-[13px] font-medium text-[var(--text-primary)] leading-snug pr-2">
        {message}
      </span>

      {/* 关闭按钮 — 仅当 onClose 提供时渲染 */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭通知"
          className="flex items-center justify-center w-6 h-6 -mr-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors duration-fast rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )
})
