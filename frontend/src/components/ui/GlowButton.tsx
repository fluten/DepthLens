/**
 * components/ui/GlowButton.tsx — accent 渐变主操作按钮
 *
 * 视觉来源:
 *   - Stitch 生成 (project 9861093748484174395, screen "Premium CTA Stage")
 *   - DESIGN.md §7.1 GlowButton 速查表 + §3.7 hover translateY(-1px) 增强
 *   - CSS 落到 styles/globals.css `.depth-glow-btn` (跨浏览器多层 box-shadow)
 *
 * 设计:
 * - 是真正的 <button>, 不是 div + role — 键盘 / form / a11y / focus 全部免费
 * - 受控 disabled (CSS :disabled 状态自动套灰度)
 * - leadingIcon / trailingIcon 是 ReactNode 插槽, 与 lucide / 自定义 SVG / 任何
 *   图标库都解耦. 避免硬绑 lucide-react 版本
 * - variant: 'primary' (accent 渐变 + 多层 glow) 或 'ghost' (透明边框, DESIGN.md §7.1)
 *
 * 用例:
 *   <GlowButton onClick={handleProcess}>
 *     PROCESS DEPTH MAP
 *     <ArrowRight />
 *   </GlowButton>
 *
 *   <GlowButton variant="ghost" leadingIcon={<X />}>
 *     Cancel
 *   </GlowButton>
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

// ── 类型 ────────────────────────────────────────────────────────────────────

/**
 * 按钮变体.
 * - 'primary': accent 渐变 + 多层 glow halo (主操作)
 * - 'ghost':   透明背景 + 边框 (次级 / 取消操作)
 */
export type GlowButtonVariant = 'primary' | 'ghost'

export interface GlowButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** 按钮变体, 默认 'primary' */
  variant?: GlowButtonVariant
  /**
   * 图标插槽 — 文字左侧. ReactNode 任意 (lucide / svg / emoji 都行).
   * 推荐尺寸 14-16px, 与文字行高匹配.
   */
  leadingIcon?: ReactNode
  /**
   * 图标插槽 — 文字右侧. 例如箭头、外链图标.
   */
  trailingIcon?: ReactNode
  /**
   * 按钮文字. 通常是大写短语 ("PROCESS DEPTH MAP"). 必填 — 没有文字的按钮
   * 应该走 IconButton 组件 (Phase 2).
   */
  children: ReactNode
}

// ── 内部: variant → CSS class 映射 ──────────────────────────────────────────

const VARIANT_CLASS: Record<GlowButtonVariant, string> = {
  primary: 'depth-glow-btn',
  ghost: 'depth-ghost-btn',
}

// ── 组件 ────────────────────────────────────────────────────────────────────

export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(
  function GlowButton(
    {
      variant = 'primary',
      leadingIcon,
      trailingIcon,
      children,
      className,
      type = 'button', // 默认 'button' 而非 'submit', 避免在 form 里意外提交
      ...rest
    },
    ref
  ) {
    const cls = className
      ? `${VARIANT_CLASS[variant]} ${className}`
      : VARIANT_CLASS[variant]

    return (
      <button ref={ref} type={type} className={cls} {...rest}>
        {leadingIcon}
        <span>{children}</span>
        {trailingIcon}
      </button>
    )
  }
)
