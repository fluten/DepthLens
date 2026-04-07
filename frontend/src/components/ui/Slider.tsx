/**
 * components/ui/Slider.tsx — accent 滑动条原子组件
 *
 * 视觉来源:
 *   - Stitch 生成 (project 9861093748484174395, screen "DepthLens Precision Slider")
 *   - 经 DESIGN.md §7.2 速查表对齐 + Stitch 三层 thumb 阴影 (外圈光环 + accent
 *     halo + 深度阴影) 增强
 *   - 真实样式实现在 styles/globals.css `.depth-slider` (跨浏览器伪元素无法
 *     通过 Tailwind 表达, 必须落到全局 CSS)
 *
 * 设计:
 * - 受控组件: value / onChange 是必填, 无内部 state, 由调用方持有
 *   (zustand store / useState / Form 都行)
 * - 底层是真正的 <input type="range">, 不是模拟实现:
 *     ✓ 键盘导航免费 (←/→ step / Shift+←/→ ×10 / Home/End / PageUp/Down)
 *     ✓ 屏幕阅读器免费 (role=slider + aria-valuenow/min/max 由浏览器自动生成)
 *     ✓ 表单提交 / focus management 免费
 *     ✓ 触屏拖拽免费
 * - 视觉填充百分比通过 CSS 自定义属性 --slider-fill 注入, 避免在 React
 *   每帧 setState 触发重渲染
 *
 * 不做 (Phase 2 范围):
 * - 双 thumb (DepthRangeSlider) — 那是单独组件
 * - 经过 10% 刻度的 thumb 弹跳反馈 (DESIGN.md §3.7) — 需要监听刻度跨越
 * - LUT morph 等高级动画
 */
import { forwardRef, useId, type CSSProperties } from 'react'

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface SliderProps {
  /** 当前值. 受控组件, 必填. */
  value: number
  /** 值变更回调. 已经是 number, 不用调用方再 parseFloat. */
  onChange: (value: number) => void
  /** 最小值, 默认 0 */
  min?: number
  /** 最大值, 默认 1 */
  max?: number
  /** 步长, 默认 0.01. 用 'any' 走连续模式 (浏览器原生不支持, 这里不暴露). */
  step?: number
  /**
   * 显示在 track 上方左侧的标签文字. 例如 "OVERLAY ALPHA".
   * 不传则不渲染 header 区域.
   */
  label?: string
  /**
   * 显示在 track 上方右侧的格式化数值. 例如 "0.62".
   * 不传则用 value.toFixed(2) 自动格式化.
   * 设为 null 强制不显示数值.
   */
  displayValue?: string | null
  /** 是否在 track 下方渲染 11 个 10% 刻度. 默认 false (Phase 2 才默认开). */
  showTicks?: boolean
  /**
   * 是否在 track 下方渲染 MIN/MAX 范围标签. 默认 false.
   * 与 showTicks 互斥渲染 (二选一, 都开会重叠).
   */
  showRange?: boolean
  /** 禁用状态. 配合 .depth-slider:disabled 样式. */
  disabled?: boolean
  /** 包裹 div 的额外 className (布局用). */
  className?: string
  /** 当未传 label 时的可访问名称 (a11y 必须二选一). */
  'aria-label'?: string
}

// ── 内部助手 ────────────────────────────────────────────────────────────────

/** 计算填充百分比 (0~100), 钳到 [0, 100], NaN/Inf → 0 */
function computeFillPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0
  if (!Number.isFinite(value)) return 0
  const ratio = (value - min) / (max - min)
  if (ratio <= 0) return 0
  if (ratio >= 1) return 100
  return ratio * 100
}

/** 默认数值格式化: 2 位小数 */
function defaultFormat(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

// ── 组件 ────────────────────────────────────────────────────────────────────

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    value,
    onChange,
    min = 0,
    max = 1,
    step = 0.01,
    label,
    displayValue,
    showTicks = false,
    showRange = false,
    disabled = false,
    className,
    'aria-label': ariaLabel,
  },
  ref
) {
  // useId 生成稳定 ID, 用于 label htmlFor → input id 的关联
  const inputId = useId()

  // 格式化显示值: undefined → 自动 toFixed(2); null → 不显示; string → 原样
  let valueText: string | null
  if (displayValue === undefined) {
    valueText = defaultFormat(value)
  } else {
    valueText = displayValue
  }

  // 通过 CSS 自定义属性注入填充百分比. CSS 层用 linear-gradient 渲染.
  // 类型断言为 CSSProperties & { [key]: string }, 因为标准类型不识别 -- 前缀.
  const fillStyle = {
    '--slider-fill': `${computeFillPercent(value, min, max)}%`,
  } as CSSProperties

  // NaN / Infinity 防御: 透传到 <input value> 会触发 React 警告
  // ("Received NaN for the value attribute"). 用 min 占位.
  const safeValue = Number.isFinite(value) ? value : min

  return (
    <div className={className}>
      {/* Header: label (左) + value (右), 与 Stitch 设计一致 */}
      {(label || valueText !== null) && (
        <div className="flex items-center justify-between mb-3">
          {label ? (
            <label
              htmlFor={inputId}
              className="text-[13px] font-bold tracking-[0.1em] text-[var(--text-secondary)] uppercase select-none"
            >
              {label}
            </label>
          ) : (
            <span />
          )}
          {valueText !== null && (
            <span className="font-mono text-[13px] text-[var(--text-primary)] tabular-nums">
              {valueText}
            </span>
          )}
        </div>
      )}

      {/* Slider track + thumb (用真正的 input[type=range], 样式在 globals.css) */}
      <div className="relative flex items-center">
        <input
          ref={ref}
          id={inputId}
          type="range"
          className="depth-slider"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={fillStyle}
          aria-label={ariaLabel ?? label}
        />
      </div>

      {/* 11 个 10% 刻度 (showTicks=true) 或 MIN/MAX 标签 (showRange=true) */}
      {showTicks && (
        <div
          className="mt-2 flex justify-between px-0.5 pointer-events-none"
          aria-hidden="true"
        >
          {Array.from({ length: 11 }).map((_, i) => (
            <div
              key={i}
              className="w-px h-[3px] bg-[rgba(255,255,255,0.08)]"
            />
          ))}
        </div>
      )}

      {showRange && !showTicks && (
        <div
          className="mt-2 flex justify-between font-mono text-[10px] text-[var(--text-tertiary)] select-none"
          aria-hidden="true"
        >
          <span>MIN {defaultFormat(min)}</span>
          <span>MAX {defaultFormat(max)}</span>
        </div>
      )}
    </div>
  )
})
