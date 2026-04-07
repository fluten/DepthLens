/**
 * components/overlay/SettingsSheet.tsx — 底部上滑设置面板 (三吸附点)
 *
 * 视觉来源:
 *   - Stitch 生成 (projects/9861093748484174395/screens/d60af880027346f8ad09089a35d72d0d,
 *     title "DepthLens SettingsSheet")
 *   - DESIGN.md §6.7 改造清单:
 *     ✓ 删除 Stitch 加的 TopAppBar / BottomNav / 模拟背景图
 *     ✓ 复用已有的 DragHandle / ModelSelector / ColormapPicker 组件, 避免重复
 *     ✓ glass-heavy + glass-heavy--sheet class 走 globals.css, 不重复写样式
 *     ✓ 所有颜色 / 圆角 / 间距改 CSS variable / tailwind token
 *     ✓ HTML 转 React TSX, 加 Framer Motion 滑入动画
 *
 * 职责 (component 层 — 组合 + 手势):
 *   1. 受控 bottom sheet, snap ∈ {'closed', 'half', 'full'} (CLAUDE.md §布局)
 *   2. Framer Motion spring 动画在三档之间过渡
 *   3. Drag 手势 → computeNextSnap 纯函数决定下一档
 *   4. 顶部 DragHandle 装饰
 *   5. 内部 render ModelSelector + divider + ColormapPicker
 *   6. 底部显示静态的键盘快捷键提示
 *
 * **三个吸附点** (CLAUDE.md §布局约束 第 205 行):
 *   - closed: sheet 完全隐藏在屏幕下方
 *   - half:   露出 50vh (半屏)
 *   - full:   露出 90vh (顶部留 10vh 防止遮挡可能的 HUD)
 *
 * **z-index**: 50 (DESIGN.md §9, 在 Mode Bar 之上, Toast 之下)
 *
 * **架构合规**:
 *   - 组件只组合子组件 + 绑定手势, 不触碰 store 业务状态
 *   - snap 由上层 (App.tsx) 通过 useState 管理, 本组件完全受控
 */
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { useCallback, useEffect } from 'react'
import { DragHandle } from '../ui/DragHandle'
import { ColormapPicker } from '../settings/ColormapPicker'
import { ModelSelector } from '../settings/ModelSelector'

// ── 类型 ────────────────────────────────────────────────────────────────────

/** Sheet 的三个吸附状态 */
export type SheetSnap = 'closed' | 'half' | 'full'

export interface SettingsSheetProps {
  /** 当前吸附点. 父组件通过 useState 管理 */
  snap: SheetSnap
  /** 吸附点变化回调 (drag 结束 / Esc / backdrop click) */
  onSnapChange: (snap: SheetSnap) => void
}

// ── 尺寸常量 ────────────────────────────────────────────────────────────────

/**
 * Sheet 的"最大高度" — 对应 full 状态. full 状态 y=0, 此时 sheet 露出 90vh.
 * 顶部留 10vh 防止覆盖未来可能的 HUD / top toast.
 */
const SHEET_HEIGHT = '90vh'

/**
 * 各 snap 对应的 y translate 值.
 * - full: y=0, sheet 完整显示
 * - half: y=40vh, 把 sheet 往下推 40vh, 等于只露出 90vh - 40vh = 50vh
 * - closed: y=100% (自身高度), sheet 完全隐出屏幕
 */
const SNAP_Y: Record<SheetSnap, string> = {
  full: '0%',
  half: '40vh',
  closed: '100%',
} as const

/** drag 判定阈值 (像素): 拖动超过这个距离就切 snap */
const DRAG_THRESHOLD_PX = 120

/** drag 判定阈值 (像素/秒): fling 速度超过这个强制推一档 */
const FLING_VELOCITY = 800

// ── 纯函数: 下一个 snap 计算 ──────────────────────────────────────────────
//
// 抽成纯函数让 drag 逻辑可以单测 (避免整 Framer Motion mock).
//
// 规则 (offset > 0 = 向下拖, < 0 = 向上拖):
//   1. 强 fling (|velocity| > 800): 推到更远一档
//   2. 中等拖动 (|offset| > 120): 推一档
//   3. 小位移: snap 回原位
//
// snap 档次从上到下: full → half → closed

/**
 * 根据 drag 结束信息计算下一个 snap.
 *
 * @param current   drag 开始时的 snap
 * @param offsetY   y 方向位移 (正数向下)
 * @param velocityY y 方向速度 (正数向下)
 * @returns         应该切换到的新 snap (可能等于 current 表示不变)
 */
export function computeNextSnap(
  current: SheetSnap,
  offsetY: number,
  velocityY: number
): SheetSnap {
  // 强 fling 优先 — 手势速度快代表明确意图, 不受位移限制
  if (velocityY > FLING_VELOCITY) {
    // 向下 fling: 推低一档
    return current === 'full' ? 'half' : 'closed'
  }
  if (velocityY < -FLING_VELOCITY) {
    // 向上 fling: 推高一档
    return current === 'closed' ? 'half' : 'full'
  }

  // 中等位移 — 按方向推一档
  if (offsetY > DRAG_THRESHOLD_PX) {
    return current === 'full' ? 'half' : 'closed'
  }
  if (offsetY < -DRAG_THRESHOLD_PX) {
    return current === 'closed' ? 'half' : 'full'
  }

  // 小位移 — snap 回原位
  return current
}

// ── 组件 ────────────────────────────────────────────────────────────────────

export function SettingsSheet({ snap, onSnapChange }: SettingsSheetProps) {
  const isOpen = snap !== 'closed'

  // Esc 关闭 — 全局键盘监听, 只在 open 时绑定
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSnapChange('closed')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onSnapChange])

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const next = computeNextSnap(snap, info.offset.y, info.velocity.y)
      if (next !== snap) onSnapChange(next)
    },
    [snap, onSnapChange]
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 — 点击空白处关闭, 但不做完全暗化, 保持 viewport 可见 */}
          <motion.div
            key="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onSnapChange('closed')}
            className="fixed inset-0 z-sheet"
            style={{
              background: 'transparent',
              pointerEvents: 'auto',
            }}
            aria-hidden="true"
          />

          {/* Sheet 主体 */}
          <motion.div
            key="settings-sheet"
            role="dialog"
            aria-modal="false"
            aria-label="设置面板"
            aria-expanded={snap === 'full'}
            initial={{ y: '100%' }}
            animate={{ y: SNAP_Y[snap] }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 25,
            }}
            drag="y"
            // 允许向上 drag (到 full 位置) 和向下 drag (到 closed 位置).
            // Framer Motion 的 constraints 是相对 animate 后的位置, 0 / 0
            // 配合 elastic 足以让用户感受到拖动反馈, 实际 snap 判定走 onDragEnd.
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.2, bottom: 0.3 }}
            onDragEnd={handleDragEnd}
            onClick={(e) => e.stopPropagation()}
            className="glass-heavy glass-heavy--sheet fixed bottom-0 left-1/2 -translate-x-1/2 z-sheet flex flex-col"
            style={{
              width: '100%',
              maxWidth: '420px',
              height: SHEET_HEIGHT,
              paddingTop: 'var(--space-3)',
              paddingLeft: 'var(--space-6)',
              paddingRight: 'var(--space-6)',
              paddingBottom: 'var(--space-6)',
              touchAction: 'none',
            }}
          >
            {/* 顶部 DragHandle — 只是视觉提示, 手势绑在整个 sheet 上 */}
            <div className="flex justify-center mb-6">
              <DragHandle />
            </div>

            {/* 滚动内容区 */}
            <div
              className="flex flex-col overflow-y-auto h-full"
              style={{ gap: 'var(--space-5)' }}
            >
              {/* MODEL 小节 */}
              <ModelSelector />

              <Divider />

              {/* COLORMAP 小节 */}
              <ColormapPicker />

              {/* 底部快捷键提示 (mt-auto 把它压到底部) */}
              <div
                className="mt-auto flex justify-between"
                style={{
                  paddingTop: 'var(--space-2)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-tertiary)',
                }}
              >
                <span>Space 关闭</span>
                <span>S 切换</span>
                <span>1-4 模式</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── 子: 分隔线 ────────────────────────────────────────────────────────────

function Divider() {
  return (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid var(--border)',
        margin: 0,
      }}
    />
  )
}
